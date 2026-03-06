// Tsentry — Express Web Server
// Dashboard + API backed by real TreasuryAgent

import 'dotenv/config'
import express from 'express'
import rateLimit from 'express-rate-limit'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TreasuryAgent } from './agent/treasury.js'
import { createX402Middleware, getX402Info } from './x402/server.js'
import { RevenueTracker, revenueMiddleware } from './x402/revenue.js'
import { USDT0_ADDRESSES } from '@t402/wdk'
import { createIndexer } from './evm/indexer.js'
import { validateToken, validateAmount, validateAddress, validateChain, VALID_STRATEGIES } from './validation.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

// ─── Agent Singleton ───
const agent = new TreasuryAgent()
let x402State = null
const revenue = new RevenueTracker()
const indexer = createIndexer()

// ─── Rate Limiters ───
const readLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false })
const writeLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false })
const txLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false })

// ─── Middleware ───
app.use(express.static(path.join(__dirname, '..', 'web', 'public')))
app.use(express.json())
app.set('views', path.join(__dirname, '..', 'web', 'views'))

// ─── Pages ───

app.get('/', (req, res) => {
  res.sendFile(path.join(app.get('views'), 'index.html'))
})

// ─── API: Read ───

app.get('/api/health', (req, res) => {
  const snap = agent.getSnapshot()
  res.json({
    status: 'ok',
    version: '0.1.0',
    uptime: Math.round(process.uptime()),
    wallet: !!snap.address,
    modules: {
      wallet: true,
      aave: !!agent.aave,
      swap: !!agent.swap,
      bridge: !!agent.bridge,
      erc4337: !!agent.erc4337,
      x402: !!x402State,
      llm: !!agent.llm,
      mcp: true
    },
    agent: { active: snap.active, paused: snap.paused, cycle: snap.cycle },
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
  })
})

app.get('/api/status', readLimiter, async (req, res) => {
  const snap = agent.getSnapshot()
  // Detect chain info from provider
  let chainInfo = { name: 'Unknown', chainId: 0, type: 'testnet' }
  try {
    const network = await agent.wallet?.provider?.getNetwork()
    const cid = Number(network?.chainId || 0)
    const { getChainById } = await import('./evm/chains.js')
    const cfg = getChainById(cid)
    if (cfg) { chainInfo = { name: cfg.name, chainId: cid, type: cfg.type } }
    else { chainInfo = { name: network?.name || `Chain ${cid}`, chainId: cid, type: 'unknown' } }
  } catch {}
  res.json({
    name: 'Tsentry',
    version: '0.1.0',
    address: snap.address,
    walletSource: snap.walletSource,
    wdkInfo: snap.wdkInfo,
    active: snap.active,
    paused: snap.paused,
    cycle: snap.cycle,
    strategy: snap.strategy?.name || 'none',
    swapProvider: snap.swapProvider || 'uniswap',
    lendingPct: snap.lendingPct,
    uptime: process.uptime(),
    chain: chainInfo
  })
})

app.get('/api/portfolio', readLimiter, (req, res) => {
  const snap = agent.getSnapshot()
  res.json({
    balances: snap.balances,
    supplied: snap.supplied,
    aaveAccount: snap.aaveAccount,
    aaveAPYs: snap.aaveAPYs,
    portfolio: snap.portfolio,
    prices: snap.prices,
    lendingPct: snap.lendingPct
  })
})

app.get('/api/actions', readLimiter, (req, res) => {
  const snap = agent.getSnapshot()
  const limit = parseInt(req.query.limit) || 50
  res.json({
    actions: snap.recentActions.slice(-limit),
    errors: snap.recentErrors
  })
})

app.get('/api/snapshot', readLimiter, (req, res) => {
  res.json(agent.getSnapshot())
})

app.get('/api/reasoning', readLimiter, (req, res) => {
  const snap = agent.getSnapshot()
  res.json({
    trail: snap.reasoningTrail || [],
    nextCheck: snap.nextCheck,
    cycle: snap.cycle,
    llm: {
      enabled: snap.llm?.enabled,
      connected: snap.llm?.connected,
      lastReasoning: snap.llm?.lastDecision?.reasoning,
      market: snap.llm?.lastDecision?.market_assessment,
      risk: snap.llm?.lastDecision?.risk_level,
      nextSuggestion: snap.llm?.lastDecision?.next_check_suggestion
    }
  })
})

app.get('/api/modules', readLimiter, (req, res) => {
  const snap = agent.getSnapshot()
  res.json({
    total: 8,
    modules: [
      { id: 'wallet', name: 'WDK Wallet', pkg: '@tetherto/wdk-wallet-evm', active: snap.walletSource === 'wdk', detail: snap.walletSource === 'wdk' ? `BIP-44 ${snap.address?.slice(0, 8)}...` : 'ethers.js fallback' },
      { id: 'erc4337', name: 'ERC-4337', pkg: '@tetherto/wdk-wallet-evm-erc-4337', active: !!snap.erc4337?.enabled, detail: snap.erc4337?.enabled ? `Safe ${snap.erc4337.mode} mode` : 'Not configured' },
      { id: 'swap', name: 'Velora DEX', pkg: '@tetherto/wdk-protocol-swap-velora-evm', active: snap.swapProvider === 'velora', detail: snap.swapProvider === 'velora' ? '160+ protocols' : 'Uniswap V3 fallback' },
      { id: 'lending', name: 'Aave V3', pkg: '@tetherto/wdk-protocol-lending-aave-evm', active: !!agent.aave, detail: `Pool ${process.env.AAVE_POOL?.slice(0, 8)}...` },
      { id: 'bridge', name: 'USDT0 Bridge', pkg: '@tetherto/wdk-protocol-bridge-usdt0-evm', active: !!agent.bridge, detail: `${snap.bridgeChains?.length || 0} chains (LayerZero V2)` },
      { id: 'mcp', name: 'MCP Toolkit', pkg: '@tetherto/wdk-mcp-toolkit', active: true, detail: '44 tools via OpenClaw' },
      { id: 'skills', name: 'Agent Skills', pkg: '@tetherto/wdk-agent-skills', active: true, detail: 'Interop standard' },
      { id: 'x402', name: 'x402 Payments', pkg: '@t402/wdk', active: !!x402State, detail: x402State ? `USDT0 on ${process.env.X402_NETWORK}` : 'Client-ready' }
    ]
  })
})

// ─── API: Control ───

app.post('/api/strategy', writeLimiter, (req, res) => {
  try {
    const { name, config } = req.body
    if (name && typeof name === 'string' && !VALID_STRATEGIES.includes(name.toUpperCase())) {
      return res.status(400).json({ error: `invalid strategy: ${name}. Valid: ${VALID_STRATEGIES.join(', ')}` })
    }
    agent.setStrategy(name || config)
    res.json({ ok: true, strategy: agent.strategy })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.post('/api/start', writeLimiter, (req, res) => {
  const interval = Number(req.body.intervalMs) || 60_000
  if (interval < 10_000 || interval > 3_600_000) {
    return res.status(400).json({ error: 'intervalMs must be between 10000 and 3600000' })
  }
  agent.start(interval)
  res.json({ ok: true, active: true, intervalMs: interval })
})

app.post('/api/stop', writeLimiter, (req, res) => {
  agent.stop()
  res.json({ ok: true, active: false })
})

app.post('/api/pause', writeLimiter, (req, res) => {
  agent.paused ? agent.resume() : agent.pause()
  res.json({ ok: true, paused: agent.paused })
})

// ─── API: LLM Control ───

app.get('/api/llm', readLimiter, (req, res) => {
  const snap = agent.getSnapshot()
  res.json(snap.llm)
})

app.post('/api/llm/toggle', writeLimiter, (req, res) => {
  agent.llmEnabled = !agent.llmEnabled
  res.json({ ok: true, llmEnabled: agent.llmEnabled, connected: !!agent.llm })
})

app.post('/api/llm/reason', writeLimiter, async (req, res) => {
  try {
    if (!agent.llm) return res.status(400).json({ error: 'LLM not connected' })
    const instruction = req.body.instruction
    if (instruction && (typeof instruction !== 'string' || instruction.length > 2000)) {
      return res.status(400).json({ error: 'instruction must be a string (max 2000 chars)' })
    }
    const snapshot = agent.getSnapshot()
    const decision = await agent.llm.reason(snapshot, { userInstruction: instruction })
    agent._lastLlmDecision = decision
    res.json({ ok: true, decision })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── API: Natural Language Command ───

app.post('/api/command', txLimiter, async (req, res) => {
  const text = (req.body.text || '').trim()
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text is required' })
  if (text.length > 500) return res.status(400).json({ error: 'text too long (max 500 chars)' })

  // Step 1: Parse the command via LLM (or pattern matching)
  const parsed = parseCommand(text)

  // Step 2: If pattern matched, execute directly. Otherwise use LLM.
  if (parsed) {
    try {
      const result = await executeAction(parsed)
      agent.log('nlp_command', `"${text}" → ${parsed.action} ${parsed.token || ''} ${parsed.amount || ''}`, result)
      return res.json({ ok: true, parsed, result, source: 'pattern' })
    } catch (e) {
      return res.status(500).json({ ok: false, parsed, error: e.message })
    }
  }

  // Step 3: LLM parsing for complex commands
  if (!agent.llm) {
    return res.status(400).json({ error: 'Command not recognized and LLM not connected. Try: "supply 50 USDT", "swap 100 USDT to WETH", "withdraw all DAI"' })
  }

  try {
    const snapshot = agent.getSnapshot()
    const decision = await agent.llm.reason(snapshot, {
      userInstruction: `The user typed this natural language command: "${text}". Parse their intent and respond with the appropriate action. If they want to execute something, include it as a high-confidence action. If they're asking a question, use the answer field.`
    })
    agent._lastLlmDecision = decision

    // Auto-execute high-confidence actions from LLM
    const executed = []
    for (const action of (decision.actions || []).filter(a => a.confidence >= 0.7)) {
      try {
        const result = await executeAction(action)
        agent.log('nlp_command', `"${text}" → ${action.type} ${action.token || ''} ${action.amount || ''}`, result)
        executed.push({ action, result })
      } catch (e) {
        executed.push({ action, error: e.message })
      }
    }

    await agent.refresh()
    return res.json({ ok: true, decision, executed, source: 'llm' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
})

/**
 * Pattern-match common natural language commands (no LLM needed)
 */
function parseCommand (text) {
  const t = text.toLowerCase().trim()
  const tokens = ['ETH', 'WETH', 'USDT', 'USDC', 'DAI', 'USDT0', 'USDC.e']
  const findToken = s => tokens.find(tk => s.includes(tk.toLowerCase())) || null
  const findAmount = s => {
    if (/\ball\b/.test(s)) return 'max'
    const m = s.match(/(\d+(?:\.\d+)?)/)
    return m ? parseFloat(m[1]) : null
  }

  // supply/deposit X TOKEN
  if (/^(supply|deposit|lend)\s/.test(t)) {
    const amount = findAmount(t)
    const token = findToken(t)
    if (amount && token) return { action: 'supply', token, amount }
  }

  // withdraw X TOKEN
  if (/^(withdraw|remove)\s/.test(t)) {
    const amount = findAmount(t)
    const token = findToken(t)
    if (amount && token) return { action: 'withdraw', token, amount }
  }

  // swap X TOKEN to/for TOKEN
  if (/^(swap|convert|exchange|trade)\s/.test(t)) {
    const amount = findAmount(t)
    const parts = t.split(/\s+(?:to|for|into|->|→)\s+/)
    const tokenIn = findToken(parts[0])
    const tokenOut = parts[1] ? findToken(parts[1]) : null
    if (amount && tokenIn && tokenOut) return { action: 'swap', tokenIn, tokenOut, amount }
  }

  // bridge X to CHAIN
  if (/^(bridge|send|transfer)\s/.test(t) && /\b(arbitrum|ethereum|base|berachain|ink)\b/.test(t)) {
    const amount = findAmount(t)
    const chainMatch = t.match(/\b(arbitrum|ethereum|base|berachain|ink)\b/)
    if (amount && chainMatch) return { action: 'bridge', targetChain: chainMatch[1], amount }
  }

  // strategy commands
  if (/^(set\s+)?strategy\s/.test(t) || /^(use|switch\s+to)\s/.test(t)) {
    const strategies = { conservative: 'CONSERVATIVE', balanced: 'BALANCED', aggressive: 'AGGRESSIVE', 'usdt yield': 'USDT_YIELD', 'tether diversified': 'TETHER_DIVERSIFIED' }
    for (const [key, val] of Object.entries(strategies)) {
      if (t.includes(key)) return { action: 'strategy', name: val }
    }
  }

  // start/stop/pause
  if (/^start\b/.test(t)) return { action: 'start' }
  if (/^stop\b/.test(t)) return { action: 'stop' }
  if (/^pause\b/.test(t)) return { action: 'pause' }
  if (/^refresh\b/.test(t)) return { action: 'refresh' }

  return null // not recognized — fall through to LLM
}

/**
 * Execute a parsed action
 */
async function executeAction (action) {
  const type = action.action || action.type
  switch (type) {
    case 'supply':
    case 'lending_supply': {
      const token = action.token
      const amount = action.amount === 'max' ? Infinity : parseFloat(action.amount)
      return agent.aave.supply(token, amount)
    }
    case 'withdraw':
    case 'lending_withdraw': {
      const token = action.token
      const amount = action.amount === 'max' ? Infinity : parseFloat(action.amount)
      return agent.aave.withdraw(token, amount)
    }
    case 'swap': {
      const tokenIn = action.tokenIn || action.token
      const tokenOut = action.tokenOut
      return agent.swap.sell(tokenIn, tokenOut, parseFloat(action.amount), 2)
    }
    case 'bridge': {
      return agent.bridge.bridge(action.targetChain, parseFloat(action.amount))
    }
    case 'strategy': {
      agent.setStrategy(action.name)
      return { strategy: agent.strategy }
    }
    case 'start': {
      agent.start(60_000)
      return { active: true }
    }
    case 'stop': {
      agent.stop()
      return { active: false }
    }
    case 'pause': {
      agent.paused ? agent.resume() : agent.pause()
      return { paused: agent.paused }
    }
    case 'transfer': {
      const token = action.token
      const to = action.to
      const amount = action.amount === 'max' ? Infinity : parseFloat(action.amount)
      return agent.wallet.transfer(token, to, amount)
    }
    case 'refresh': {
      await agent.refresh()
      return { balances: agent.balances }
    }
    default:
      throw new Error(`Unknown action: ${type}`)
  }
}

// ─── API: Conditional Rules ───

app.get('/api/rules', readLimiter, (req, res) => {
  res.json({ rules: agent.getRules() })
})

app.post('/api/rules', writeLimiter, async (req, res) => {
  const { text, rule: directRule } = req.body

  // Option A: Direct structured rule
  if (directRule) {
    try {
      const added = agent.addRule(directRule)
      return res.json({ ok: true, rule: added, source: 'direct' })
    } catch (e) {
      return res.status(400).json({ error: e.message })
    }
  }

  // Option B: Natural language → LLM parses into structured rule
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Provide "text" (natural language) or "rule" (structured)' })
  }
  if (text.length > 1000) return res.status(400).json({ error: 'text too long (max 1000 chars)' })

  if (!agent.llm) {
    return res.status(400).json({ error: 'LLM not connected — cannot parse natural language rules. Provide a structured "rule" object instead.' })
  }

  try {
    const snapshot = agent.getSnapshot()
    const parsed = await agent.llm.parseRule(text, snapshot)

    if (parsed.confidence < 0.5) {
      return res.json({ ok: false, parsed, error: 'Low confidence — please rephrase or be more specific' })
    }

    const added = agent.addRule(parsed)
    agent.log('nlp_rule', `Rule created via NL: "${text}" → "${parsed.description}"`, { id: added.id })
    return res.json({ ok: true, rule: added, parsed, source: 'llm' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
})

app.delete('/api/rules/:id', writeLimiter, (req, res) => {
  const removed = agent.removeRule(req.params.id)
  if (!removed) return res.status(404).json({ error: 'Rule not found' })
  res.json({ ok: true })
})

app.post('/api/cycle', writeLimiter, async (req, res) => {
  try {
    await agent.cycle()
    res.json({ ok: true, snapshot: agent.getSnapshot() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/refresh', writeLimiter, async (req, res) => {
  try {
    await agent.refresh()
    const snap = agent.getSnapshot()
    res.json({
      ok: true,
      balances: snap.balances,
      supplied: snap.supplied,
      portfolio: snap.portfolio
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── API: Direct Actions ───

app.post('/api/supply', txLimiter, async (req, res) => {
  try {
    const { token, amount } = req.body
    let err = validateToken(token)
    if (err) return res.status(400).json({ error: err })
    err = validateAmount(amount)
    if (err) return res.status(400).json({ error: err })
    const result = await agent.aave.supply(token, parseFloat(amount))
    agent.log('manual_supply', `Manual supply ${amount} ${token}`, result)
    await agent.refresh()
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/withdraw', txLimiter, async (req, res) => {
  try {
    const { token, amount } = req.body
    let err = validateToken(token)
    if (err) return res.status(400).json({ error: err })
    err = validateAmount(amount)
    if (err) return res.status(400).json({ error: err })
    const amt = amount === 'max' ? Infinity : parseFloat(amount)
    const result = await agent.aave.withdraw(token, amt)
    agent.log('manual_withdraw', `Manual withdraw ${amount} ${token}`, result)
    await agent.refresh()
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── API: Swap ───

app.get('/api/swap/pairs', readLimiter, (req, res) => {
  res.json({
    pairs: agent.swapPairs,
    provider: agent.swapProvider,
    note: agent.swapPairs.length === 0
      ? 'No liquidity pools available on this testnet. Swap is fully functional — pools on mainnet (Velora, 160+ DEXs) have deep liquidity. Try Ethereum Sepolia or switch to mainnet.'
      : undefined
  })
})

app.post('/api/swap/quote', writeLimiter, async (req, res) => {
  try {
    const { tokenIn, tokenOut, amount, side } = req.body
    let err = validateToken(tokenIn)
    if (err) return res.status(400).json({ error: `tokenIn: ${err}` })
    err = validateToken(tokenOut)
    if (err) return res.status(400).json({ error: `tokenOut: ${err}` })
    err = validateAmount(amount)
    if (err) return res.status(400).json({ error: err })
    if (side && !['buy', 'sell'].includes(side)) return res.status(400).json({ error: 'side must be buy or sell' })
    const quote = await agent.swap.quote(tokenIn, tokenOut, parseFloat(amount), side || 'sell')
    res.json({ ok: true, ...quote })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/swap/execute', txLimiter, async (req, res) => {
  try {
    const { tokenIn, tokenOut, amount, slippage } = req.body
    let err = validateToken(tokenIn)
    if (err) return res.status(400).json({ error: `tokenIn: ${err}` })
    err = validateToken(tokenOut)
    if (err) return res.status(400).json({ error: `tokenOut: ${err}` })
    err = validateAmount(amount)
    if (err) return res.status(400).json({ error: err })
    const slip = Number(slippage) || 2
    if (slip < 0.01 || slip > 50) return res.status(400).json({ error: 'slippage must be 0.01-50%' })
    const result = await agent.swap.sell(tokenIn, tokenOut, parseFloat(amount), slip)
    agent.log('manual_swap', `Manual swap ${amount} ${tokenIn} → ${result.amountOut} ${tokenOut}`, result)
    await agent.refresh()
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── API: Bridge ───

app.get('/api/bridge/chains', readLimiter, (req, res) => {
  res.json({ chains: agent.bridgeChains, routes: agent.bridgeRoutes })
})

app.post('/api/bridge/quote', writeLimiter, async (req, res) => {
  try {
    const { sourceChain, targetChain, amount } = req.body
    let err = validateChain(sourceChain)
    if (err) return res.status(400).json({ error: `sourceChain: ${err}` })
    err = validateChain(targetChain)
    if (err) return res.status(400).json({ error: `targetChain: ${err}` })
    err = validateAmount(amount)
    if (err) return res.status(400).json({ error: err })
    const quote = await agent.bridge.quote(sourceChain, targetChain, parseFloat(amount))
    res.json({ ok: true, ...quote })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/bridge/quote-all', writeLimiter, async (req, res) => {
  try {
    const { sourceChain, amount } = req.body
    let err = validateChain(sourceChain)
    if (err) return res.status(400).json({ error: `sourceChain: ${err}` })
    err = validateAmount(amount)
    if (err) return res.status(400).json({ error: err })
    const quotes = await agent.bridge.quoteAllRoutes(sourceChain, parseFloat(amount))
    res.json({ ok: true, quotes })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/bridge/execute', txLimiter, async (req, res) => {
  try {
    const { targetChain, amount, recipient } = req.body
    let err = validateChain(targetChain)
    if (err) return res.status(400).json({ error: `targetChain: ${err}` })
    err = validateAmount(amount)
    if (err) return res.status(400).json({ error: err })
    if (recipient) {
      err = validateAddress(recipient)
      if (err) return res.status(400).json({ error: `recipient: ${err}` })
    }
    const result = await agent.bridge.bridge(targetChain, parseFloat(amount), recipient)
    agent.log('manual_bridge', `Bridge ${amount} USDT0 → ${targetChain}`, result)
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── API: ERC-4337 Smart Account ───

app.get('/api/erc4337', readLimiter, (req, res) => {
  const snap = agent.getSnapshot()
  res.json(snap.erc4337)
})

app.post('/api/erc4337/quote-transfer', writeLimiter, async (req, res) => {
  try {
    if (!agent.erc4337) return res.status(400).json({ error: 'ERC-4337 not configured (set ERC4337_BUNDLER_URL)' })
    const { token, to, amount } = req.body
    let err = validateToken(token)
    if (err) return res.status(400).json({ error: err })
    err = validateAddress(to)
    if (err) return res.status(400).json({ error: err })
    err = validateAmount(amount)
    if (err) return res.status(400).json({ error: err })
    const tokenInfo = agent.wallet.tokens[token]
    if (!tokenInfo) return res.status(400).json({ error: `Unknown token: ${token}` })
    const { parseUnits } = await import('ethers')
    const amountWei = parseUnits(amount.toString(), tokenInfo.decimals)
    const quote = await agent.erc4337.quoteTransfer(tokenInfo.address, to, amountWei)
    res.json({ ok: true, ...quote })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/erc4337/transfer', txLimiter, async (req, res) => {
  try {
    if (!agent.erc4337) return res.status(400).json({ error: 'ERC-4337 not configured' })
    const { token, to, amount } = req.body
    let err = validateToken(token)
    if (err) return res.status(400).json({ error: err })
    err = validateAddress(to)
    if (err) return res.status(400).json({ error: err })
    err = validateAmount(amount)
    if (err) return res.status(400).json({ error: err })
    const tokenInfo = agent.wallet.tokens[token]
    if (!tokenInfo) return res.status(400).json({ error: `Unknown token: ${token}` })
    const { parseUnits } = await import('ethers')
    const amountWei = parseUnits(amount.toString(), tokenInfo.decimals)
    const result = await agent.erc4337.transfer(tokenInfo.address, to, amountWei)
    agent.log('erc4337_transfer', `Smart Account transfer ${amount} ${token} → ${to}`, result)
    res.json({ ok: true, hash: result.hash, fee: result.fee.toString() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── API: Credit Scoring (Lending Bot Track) ───

app.get('/api/credit-score', readLimiter, async (req, res) => {
  try {
    const address = req.query.address || agent.wallet?.address
    if (!address) return res.status(400).json({ error: 'No address provided' })
    const addrErr = validateAddress(address)
    if (addrErr) return res.status(400).json({ error: addrErr })

    const { CreditScorer } = await import('./evm/credit-score.js')
    const scorer = new CreditScorer({
      provider: agent.wallet?.provider,
      poolAddress: process.env.AAVE_POOL,
      tokens: agent.wallet?.tokens || {}
    })
    const result = await scorer.score(address)
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/credit-score/assess', txLimiter, async (req, res) => {
  try {
    const { borrower, amount, token } = req.body
    if (!borrower) return res.status(400).json({ error: 'borrower address required' })
    const addrErr2 = validateAddress(borrower)
    if (addrErr2) return res.status(400).json({ error: addrErr2 })

    const { CreditScorer } = await import('./evm/credit-score.js')
    const scorer = new CreditScorer({
      provider: agent.wallet?.provider,
      poolAddress: process.env.AAVE_POOL,
      tokens: agent.wallet?.tokens || {}
    })
    const credit = await scorer.score(borrower)

    const requestedUSD = parseFloat(amount) || 0
    const approved = requestedUSD <= credit.maxLoanUSD
    const decision = {
      ...credit,
      loanRequest: { amount: requestedUSD, token: token || 'USDT' },
      approved,
      reason: approved
        ? `Approved: score ${credit.score}/100, max loan $${credit.maxLoanUSD}, requested $${requestedUSD}`
        : `Denied: score ${credit.score}/100, max loan $${credit.maxLoanUSD}, requested $${requestedUSD} exceeds limit`,
      terms: approved ? {
        apr: credit.suggestedAPR,
        maxDuration: credit.score >= 60 ? '30 days' : '14 days',
        collateralRequired: credit.score >= 80 ? 'none' : credit.score >= 60 ? '120%' : credit.score >= 40 ? '150%' : '200%'
      } : null
    }

    agent.log('credit', `Credit assessment: ${borrower.slice(0, 10)}... → score ${credit.score}, ${approved ? 'APPROVED' : 'DENIED'} $${requestedUSD}`)
    res.json(decision)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── API: x402 Payment Protocol ───

app.get('/api/x402', readLimiter, (req, res) => {
  res.json(getX402Info(x402State))
})

app.get('/api/x402/revenue', readLimiter, (req, res) => {
  const summary = revenue.getSummary()
  if (req.query.since) {
    const since = revenue.getSince(req.query.since)
    return res.json({ ...summary, filtered: since })
  }
  res.json(summary)
})

// ─── API: Transaction History (WDK Indexer) ───

app.get('/api/history', readLimiter, async (req, res) => {
  if (!indexer) return res.json({ enabled: false, transfers: [] })
  try {
    const address = agent.wallet?.address
    if (!address) return res.status(400).json({ error: 'Wallet not initialized' })
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100)
    const transfers = await indexer.getTransfers(address, {
      limit,
      tokenAddress: req.query.token || undefined
    })
    res.json({ enabled: true, transfers })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/indexer', readLimiter, (req, res) => {
  res.json(indexer ? indexer.getInfo() : { enabled: false })
})

// ─── API: Agent Skills ───

app.get('/api/skills', readLimiter, (req, res) => {
  const snap = agent.getSnapshot()
  res.json({
    name: 'tsentry',
    version: '0.1.0',
    description: 'Autonomous Multi-Chain Treasury Agent powered by Tether WDK',
    skills: [
      { id: 'wallet', name: 'Multi-Chain Wallet', module: 'wdk-wallet-evm', status: 'active', capabilities: ['balance', 'transfer', 'sign', 'approve'] },
      { id: 'erc4337', name: 'Account Abstraction', module: 'wdk-wallet-evm-erc-4337', status: snap.erc4337?.enabled ? 'active' : 'inactive', capabilities: ['gasless_transfer', 'batch_transactions', 'smart_account'] },
      { id: 'swap', name: 'DEX Aggregator', module: 'wdk-protocol-swap-velora-evm', status: 'active', provider: snap.swapProvider, capabilities: ['quote', 'swap', '160+_dex_aggregation'] },
      { id: 'lending', name: 'Lending Protocol', module: 'wdk-protocol-lending-aave-evm', status: 'active', capabilities: ['supply', 'withdraw', 'borrow', 'repay', 'emode'] },
      { id: 'bridge', name: 'Cross-Chain Bridge', module: 'wdk-protocol-bridge-usdt0', status: 'active', capabilities: ['quote', 'bridge', '26+_chains'] },
      { id: 'mcp', name: 'MCP Toolkit', module: 'wdk-mcp-toolkit', status: 'active', capabilities: ['42_tools', 'ai_agent_interop'] },
      { id: 'x402', name: 'Agentic Payments', module: 't402-wdk', status: x402State ? 'active' : (snap.x402?.enabled ? 'client_only' : 'inactive'), capabilities: ['http_402', 'micropayments', 'usdt0_payments', 'eip3009'] },
      { id: 'reasoning', name: 'LLM Reasoning', module: 'anthropic-claude', status: snap.llm?.connected ? 'active' : 'inactive', capabilities: ['market_analysis', 'risk_assessment', 'strategy_optimization'] }
    ],
    wdkModules: {
      total: 8,
      integrated: 8,
      list: [
        'wdk-wallet-evm',
        'wdk-wallet-evm-erc-4337',
        'wdk-protocol-swap-velora-evm',
        'wdk-protocol-lending-aave-evm',
        'wdk-protocol-bridge-usdt0',
        'wdk-mcp-toolkit',
        'wdk-agent-skills',
        't402-wdk'
      ]
    }
  })
})

// ─── Boot ───

async function boot () {
  try {
    await agent.init()
    console.log(`[tsentry] Wallet: ${agent.wallet.address}`)
    console.log(`[tsentry] Balances:`, agent.balances)
    console.log(`[tsentry] Aave supplied:`, agent.supplied)

    // Default strategy — USDT-centric for Tether hackathon
    agent.setStrategy('USDT_YIELD')

    // x402 payment gate — activated by X402_NETWORK env var
    // Gates premium endpoints behind USDT0 micropayments via t402 protocol
    if (process.env.X402_NETWORK) {
      try {
        const network = process.env.X402_NETWORK // e.g., "eip155:42161"
        const chain = network.split(':')[1] // e.g., "42161"
        const chainName = { 1: 'ethereum', 42161: 'arbitrum', 8453: 'base' }[chain] || 'ethereum'
        const tokenAddress = process.env.X402_TOKEN || USDT0_ADDRESSES[chainName]

        if (tokenAddress) {
          x402State = createX402Middleware({
            network,
            tokenAddress,
            facilitatorUrl: process.env.X402_FACILITATOR || 'https://facilitator.t402.io',
            pricing: process.env.X402_PRICING ? JSON.parse(process.env.X402_PRICING) : undefined
          })
          app.use(x402State.middleware)
          app.use(revenueMiddleware(revenue, x402State.config))
          console.log(`[tsentry] x402 payment gate active (${network}, token: ${tokenAddress})`)
          console.log(`[tsentry] x402 gated routes: ${x402State.config.routes.join(', ')}`)
          console.log(`[tsentry] x402 revenue tracking enabled`)
        } else {
          console.log(`[tsentry] x402 skipped — no token address for chain ${chainName}`)
        }
      } catch (e) {
        console.log(`[tsentry] x402 init failed: ${e.message} — continuing without payment gate`)
      }
    }

    app.listen(PORT, () => {
      console.log(`[tsentry] Dashboard: http://localhost:${PORT}`)
    })
  } catch (e) {
    console.error('[tsentry] Boot failed:', e.message)
    process.exit(1)
  }
}

boot()
