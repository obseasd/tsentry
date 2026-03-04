#!/usr/bin/env node
// Tsentry — Agent-to-Agent x402 Payment Demo
//
// Visual demonstration of autonomous agent-to-agent payments via x402 (t402) protocol:
//   Agent A (Treasury Server) — runs Tsentry with x402 payment gate
//   Agent B (Client Agent)    — pays Agent A's x402-protected endpoints with USDT0
//
// Usage:
//   node scripts/demo-agent2agent.js --simulate       # Simulated flow (no real wallet)
//   AGENT_B_KEY=0x... node scripts/demo-agent2agent.js # Live x402 payments

import 'dotenv/config'

const BASE = process.env.AGENT_A_URL || 'http://localhost:3000'
const SIMULATE = process.argv.includes('--simulate')

// ─── Colors & Formatting ───
const C = {
  R: '\x1b[0m', B: '\x1b[1m', D: '\x1b[2m', I: '\x1b[3m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  white: '\x1b[97m', gray: '\x1b[90m',
  bgGreen: '\x1b[42m', bgBlue: '\x1b[44m', bgMagenta: '\x1b[45m', bgYellow: '\x1b[43m',
  bgCyan: '\x1b[46m', bgRed: '\x1b[41m'
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

function banner () {
  console.log(`
${C.B}${C.cyan}  ╔══════════════════════════════════════════════════════════════╗
  ║                                                              ║
  ║   ████████╗███████╗███████╗███╗   ██╗████████╗██████╗ ██╗   ║
  ║      ██╔══╝██╔════╝██╔════╝████╗  ██║   ██╔══╝██╔══██╗╚██╗  ║
  ║      ██║   ███████╗█████╗  ██╔██╗ ██║   ██║   ██████╔╝ ██║  ║
  ║      ██║   ╚════██║██╔══╝  ██║╚██╗██║   ██║   ██╔══██╗ ██║  ║
  ║      ██║   ███████║███████╗██║ ╚████║   ██║   ██║  ██║██╔╝  ║
  ║      ╚═╝   ╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝╚═╝   ║
  ║                                                              ║
  ║     ${C.white}Agent-to-Agent x402 Payment Protocol Demo${C.cyan}              ║
  ║     ${C.gray}Machine-to-machine USDT0 micropayments${C.cyan}                 ║
  ║                                                              ║
  ╚══════════════════════════════════════════════════════════════╝${C.R}
`)
}

function box (title, lines, color = C.cyan) {
  const maxLen = Math.max(title.length, ...lines.map(l => stripAnsi(l).length))
  const w = maxLen + 4
  const pad = s => s + ' '.repeat(Math.max(0, w - stripAnsi(s).length))
  console.log(`  ${color}┌${'─'.repeat(w + 2)}┐${C.R}`)
  console.log(`  ${color}│${C.R} ${C.B}${pad(title)}${C.R} ${color}│${C.R}`)
  console.log(`  ${color}├${'─'.repeat(w + 2)}┤${C.R}`)
  for (const line of lines) {
    console.log(`  ${color}│${C.R} ${pad(line)} ${color}│${C.R}`)
  }
  console.log(`  ${color}└${'─'.repeat(w + 2)}┘${C.R}`)
}

function stripAnsi (s) { return s.replace(/\x1b\[[0-9;]*m/g, '') }

function step (n, title) {
  console.log(`\n  ${C.B}${C.white}── Step ${n} ──────────────────────────────────────────${C.R}`)
  console.log(`  ${C.B}${C.white}${title}${C.R}\n`)
}

function agentA (msg) { console.log(`  ${C.bgBlue}${C.white}${C.B} A ${C.R} ${C.blue}${msg}${C.R}`) }
function agentB (msg) { console.log(`  ${C.bgYellow}${C.white}${C.B} B ${C.R} ${C.yellow}${msg}${C.R}`) }
function info (msg) { console.log(`  ${C.gray}   ${msg}${C.R}`) }
function ok (msg) { console.log(`  ${C.green}   ✓ ${msg}${C.R}`) }
function payment (msg) { console.log(`  ${C.bgMagenta}${C.white}${C.B} $ ${C.R} ${C.magenta}${msg}${C.R}`) }

async function progress (label, ms = 600) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  const end = Date.now() + ms
  let i = 0
  while (Date.now() < end) {
    process.stdout.write(`\r  ${C.cyan}   ${frames[i++ % frames.length]} ${label}${C.R}`)
    await sleep(80)
  }
  process.stdout.write(`\r  ${C.green}   ✓ ${label}${C.R}\n`)
}

function flowDiagram (from, to, label, amount) {
  console.log()
  console.log(`  ${C.B}${C.blue}  ┌──────────┐${C.R}      ${C.magenta}${amount}${C.R}      ${C.B}${C.yellow}┌──────────┐${C.R}`)
  console.log(`  ${C.B}${C.blue}  │ ${from.padEnd(8)} │${C.R} ──${C.magenta}── ${label} ──${C.R}─▶ ${C.B}${C.yellow}│ ${to.padEnd(8)} │${C.R}`)
  console.log(`  ${C.B}${C.blue}  └──────────┘${C.R}                    ${C.B}${C.yellow}└──────────┘${C.R}`)
  console.log()
}

// ─── Simulated Demo ───

async function runSimulated () {
  banner()

  box('Demo Configuration', [
    `${C.gray}Mode:${C.R}      ${C.yellow}Simulated${C.R} (no real wallet needed)`,
    `${C.gray}Agent A:${C.R}   Tsentry Treasury Server`,
    `${C.gray}Agent B:${C.R}   External AI Client Agent`,
    `${C.gray}Protocol:${C.R}  HTTP 402 + EIP-3009 (x402/t402)`,
    `${C.gray}Token:${C.R}     USDT0 on Arbitrum (eip155:42161)`,
    `${C.gray}Server:${C.R}    ${BASE}`
  ])
  await sleep(800)

  // ── Step 1: Discovery ──
  step(1, 'Agent B discovers Agent A\'s capabilities')

  agentB(`GET ${BASE}/api/skills`)
  await progress('Fetching agent capabilities')

  try {
    const res = await fetch(`${BASE}/api/skills`)
    const skills = await res.json()
    ok(`Found: ${skills.name} v${skills.version}`)
    const names = skills.skills.map(s => s.name)
    box('Agent A Skills', [
      ...names.map(n => `  ${C.green}●${C.R} ${n}`),
      '',
      `  ${C.B}${skills.wdkModules?.integrated || 8}/8 WDK modules integrated${C.R}`
    ], C.blue)
  } catch {
    ok('Skills endpoint discovered (using mock)')
    box('Agent A Skills', [
      `  ${C.green}●${C.R} Multi-Chain Wallet`, `  ${C.green}●${C.R} DEX Aggregator`,
      `  ${C.green}●${C.R} Lending Protocol`, `  ${C.green}●${C.R} Cross-Chain Bridge`,
      `  ${C.green}●${C.R} Account Abstraction`, `  ${C.green}●${C.R} Agentic Payments`,
      `  ${C.green}●${C.R} LLM Reasoning`, `  ${C.green}●${C.R} MCP Toolkit`,
      '', `  ${C.B}8/8 WDK modules integrated${C.R}`
    ], C.blue)
  }
  await sleep(600)

  // ── Step 2: Price Discovery ──
  step(2, 'Agent B discovers x402 payment pricing')

  agentB(`GET ${BASE}/api/x402`)
  await progress('Checking payment requirements')

  let pricing = { snapshot: '10000', execute_swap: '100000', llm_reason: '50000' }
  try {
    const res = await fetch(`${BASE}/api/x402`)
    const x402 = await res.json()
    if (x402.enabled && x402.pricing) pricing = x402.pricing
    ok(`x402 ${x402.enabled ? 'active' : 'discoverable'} on Agent A`)
  } catch {
    ok('x402 pricing discovered')
  }

  box('x402 Payment Menu', [
    `${C.gray}Endpoint${C.R}                    ${C.gray}Price${C.R}`,
    `${'─'.repeat(42)}`,
    `GET  /api/snapshot           ${C.green}$${(Number(pricing.snapshot) / 1e6).toFixed(3)}${C.R}`,
    `POST /api/swap/execute       ${C.green}$${(Number(pricing.execute_swap) / 1e6).toFixed(3)}${C.R}`,
    `POST /api/bridge/execute     ${C.green}$${(Number(pricing.execute_bridge || pricing.execute_swap) / 1e6).toFixed(3)}${C.R}`,
    `POST /api/llm/reason         ${C.green}$${(Number(pricing.llm_reason) / 1e6).toFixed(3)}${C.R}`,
    `${'─'.repeat(42)}`,
    `${C.gray}Token: USDT0  │  Settlement: Gasless (EIP-3009)${C.R}`
  ], C.magenta)
  await sleep(800)

  // ── Step 3: Agent B requests paid data ──
  step(3, 'Agent B requests portfolio snapshot ($0.01)')

  agentB(`GET ${BASE}/api/snapshot`)
  await sleep(300)
  agentA('Incoming request → no payment header detected')
  agentA('Responding with HTTP 402 Payment Required')
  console.log()
  info(`${C.red}${C.B}← 402 Payment Required${C.R}`)
  info(`${C.gray}X-Payment-Required: {"accepts":[{`)
  info(`${C.gray}  "network": "eip155:42161",`)
  info(`${C.gray}  "token": "0x3b3ae790Df4F312e745D270119c6052904FB6790",`)
  info(`${C.gray}  "maxAmountRequired": "10000"`)
  info(`${C.gray}}]}`)
  await sleep(600)

  agentB('Received 402 — payment required. Preparing authorization...')

  // ── Step 4: EIP-3009 Signature ──
  step(4, 'Agent B signs EIP-3009 transferWithAuthorization')

  flowDiagram('Agent B', 'Agent A', 'USDT0', '$0.01')

  agentB('Constructing EIP-712 typed data...')
  await progress('Signing transferWithAuthorization')

  box('EIP-3009 Authorization', [
    `${C.gray}domain:${C.R}      { name: "USDT0", version: "1", chainId: 42161 }`,
    `${C.gray}from:${C.R}        0xB0b7...9F3a  ${C.D}(Agent B wallet)${C.R}`,
    `${C.gray}to:${C.R}          0xFaci...7E2d  ${C.D}(x402 Facilitator)${C.R}`,
    `${C.gray}value:${C.R}       ${C.green}10000${C.R} (= $0.01 USDT0, 6 decimals)`,
    `${C.gray}validAfter:${C.R}  0`,
    `${C.gray}validBefore:${C.R} 1741000000`,
    `${C.gray}nonce:${C.R}       0x7f3a...9c2e  ${C.D}(random)${C.R}`,
    `${'─'.repeat(50)}`,
    `${C.gray}signature:${C.R}   ${C.green}0xabc1...f789${C.R} (65 bytes, v/r/s)`
  ], C.yellow)
  await sleep(600)

  ok('Authorization signed — gasless for Agent B (no ETH needed)')

  // ── Step 5: Retry with payment ──
  step(5, 'Agent B retries with X-PAYMENT header')

  agentB(`GET ${BASE}/api/snapshot`)
  info(`${C.magenta}X-PAYMENT: { scheme: "exact", payload: { signature: "0xabc1..." } }`)
  await sleep(400)

  agentA('Received request with X-PAYMENT header')
  await progress('Facilitator verifying payment on-chain', 800)

  payment('Facilitator: transferWithAuthorization verified on Arbitrum')
  payment('Settlement: 10000 USDT0 (6 dec) transferred to Agent A')
  ok('Payment verified — releasing protected data')
  await sleep(300)

  // Actually fetch snapshot
  try {
    const res = await fetch(`${BASE}/api/snapshot`)
    const snap = await res.json()
    agentA('← 200 OK — snapshot released')
    agentB('Received portfolio snapshot:')
    box('Portfolio Snapshot (paid data)', [
      `${C.gray}Address:${C.R}   ${snap.address || '0x...'}`,
      `${C.gray}Strategy:${C.R}  ${snap.strategy?.name || 'USDT Yield'}`,
      `${C.gray}Balances:${C.R}  ${JSON.stringify(snap.balances || {})}`,
      `${C.gray}Lending:${C.R}   ${snap.lendingPct || '0'}% in Aave`,
      `${C.gray}Swap via:${C.R}  ${snap.swapProvider || 'Velora/Uniswap'}`,
      `${C.gray}Active:${C.R}    ${snap.active ? 'Yes' : 'No'}`
    ], C.green)
  } catch {
    agentA('← 200 OK — snapshot data released')
    agentB('Full portfolio snapshot received')
  }
  await sleep(600)

  // ── Step 6: Revenue tracked ──
  step(6, 'Agent A tracks revenue')

  agentA('+$0.01 USDT0 revenue from GET /api/snapshot')
  try {
    const res = await fetch(`${BASE}/api/x402/revenue`)
    const rev = await res.json()
    box('Revenue Dashboard', [
      `${C.gray}Total Revenue:${C.R}  ${C.green}$${rev.totalRevenueUSD}${C.R}`,
      `${C.gray}Payments:${C.R}       ${rev.totalPayments}`,
      ...(rev.byRoute ? Object.entries(rev.byRoute).map(([route, stats]) =>
        `${C.gray}${route}:${C.R}  ${stats.count}x = $${stats.totalUSD}`
      ) : [])
    ], C.green)
  } catch {
    box('Revenue Dashboard', [
      `${C.gray}Total Revenue:${C.R}  ${C.green}$0.01${C.R}`,
      `${C.gray}Payments:${C.R}       1`
    ], C.green)
  }
  await sleep(600)

  // ── Step 7: LLM reasoning (paid) ──
  step(7, 'Agent B requests AI market analysis ($0.05)')

  flowDiagram('Agent B', 'Agent A', 'USDT0', '$0.05')

  agentB(`POST ${BASE}/api/llm/reason`)
  info(`${C.gray}body: { instruction: "Analyze USDT yield opportunities on Arbitrum" }`)
  info(`${C.magenta}X-PAYMENT: { amount: 50000 ($0.05 USDT0) }`)
  await sleep(300)

  payment('Facilitator: payment verified ($0.05 USDT0)')
  agentA('Payment accepted — executing LLM reasoning...')
  await progress('Claude Haiku analyzing treasury state', 1000)
  agentA('← 200 OK — returning AI analysis')

  agentB('Received LLM analysis:')
  box('AI Market Analysis (paid)', [
    `${C.gray}Market:${C.R}        ${C.green}Stable${C.R} — low volatility regime`,
    `${C.gray}Risk Level:${C.R}    ${C.green}LOW${C.R}`,
    `${C.gray}USDT APY:${C.R}      4.2% (Aave V3 Sepolia)`,
    `${C.gray}Recommendation:${C.R} Maintain USDT Yield strategy`,
    `${C.gray}Confidence:${C.R}    ${C.green}87%${C.R}`,
    `${'─'.repeat(46)}`,
    `${C.D}Agent B can now use this analysis to inform${C.R}`,
    `${C.D}its own autonomous treasury decisions.${C.R}`
  ], C.magenta)
  await sleep(600)

  // ── Step 8: Second payment summary ──
  step(8, 'Final revenue summary')

  try {
    const res = await fetch(`${BASE}/api/x402/revenue`)
    const rev = await res.json()
    agentA(`Total revenue: $${rev.totalRevenueUSD} from ${rev.totalPayments} payments`)
  } catch {
    agentA('Total revenue: $0.06 from 2 payments')
  }
  await sleep(300)

  // ── Summary ──
  console.log(`
  ${C.B}${C.cyan}╔══════════════════════════════════════════════════════════════╗
  ║                    Demo Complete                             ║
  ╠══════════════════════════════════════════════════════════════╣${C.R}
  ${C.cyan}║${C.R} ${C.green}✓${C.R} Agent B discovered Agent A capabilities   ${C.gray}(free)${C.R}       ${C.cyan}║${C.R}
  ${C.cyan}║${C.R} ${C.green}✓${C.R} Agent B discovered x402 payment pricing   ${C.gray}(free)${C.R}       ${C.cyan}║${C.R}
  ${C.cyan}║${C.R} ${C.green}✓${C.R} Agent B paid for portfolio snapshot       ${C.magenta}$0.01 USDT0${C.R}  ${C.cyan}║${C.R}
  ${C.cyan}║${C.R} ${C.green}✓${C.R} Agent B paid for LLM market analysis     ${C.magenta}$0.05 USDT0${C.R}  ${C.cyan}║${C.R}
  ${C.cyan}║${C.R} ${C.green}✓${C.R} All payments gasless for Agent B         ${C.gray}EIP-3009${C.R}     ${C.cyan}║${C.R}
  ${C.cyan}║${C.R} ${C.green}✓${C.R} Revenue tracked automatically            ${C.green}$0.06 total${C.R}  ${C.cyan}║${C.R}
  ${C.B}${C.cyan}╠══════════════════════════════════════════════════════════════╣
  ║                   Key Takeaways                             ║
  ╠══════════════════════════════════════════════════════════════╣${C.R}
  ${C.cyan}║${C.R}                                                            ${C.cyan}║${C.R}
  ${C.cyan}║${C.R}  ${C.B}Autonomous:${C.R} No human intervention needed              ${C.cyan}║${C.R}
  ${C.cyan}║${C.R}  ${C.B}Gasless:${C.R}    Agent B pays in USDT0, no ETH required    ${C.cyan}║${C.R}
  ${C.cyan}║${C.R}  ${C.B}Atomic:${C.R}     Payment + data delivery in one request    ${C.cyan}║${C.R}
  ${C.cyan}║${C.R}  ${C.B}Standard:${C.R}   HTTP 402 — works with any HTTP client     ${C.cyan}║${C.R}
  ${C.cyan}║${C.R}  ${C.B}Composable:${C.R} Any agent can pay any other agent         ${C.cyan}║${C.R}
  ${C.cyan}║${C.R}                                                            ${C.cyan}║${C.R}
  ${C.B}${C.cyan}╠══════════════════════════════════════════════════════════════╣
  ║                     Protocol                                ║
  ╠══════════════════════════════════════════════════════════════╣${C.R}
  ${C.cyan}║${C.R}  ${C.gray}x402 Standard:${C.R}  HTTP 402 + EIP-3009              ${C.cyan}║${C.R}
  ${C.cyan}║${C.R}  ${C.gray}Implementation:${C.R} @t402/wdk + @t402/express        ${C.cyan}║${C.R}
  ${C.cyan}║${C.R}  ${C.gray}Token:${C.R}          USDT0 on Arbitrum (eip155:42161)  ${C.cyan}║${C.R}
  ${C.cyan}║${C.R}  ${C.gray}Settlement:${C.R}     Facilitator → on-chain            ${C.cyan}║${C.R}
  ${C.cyan}║${C.R}  ${C.gray}Gas for payer:${C.R}  $0.00 (transferWithAuthorization) ${C.cyan}║${C.R}
  ${C.B}${C.cyan}╚══════════════════════════════════════════════════════════════╝${C.R}
`)
}

// ─── Live Mode ───

async function runLive () {
  banner()

  const AGENT_B_KEY = process.env.AGENT_B_KEY
  if (!AGENT_B_KEY) {
    console.error(`  ${C.red}${C.B}Error: AGENT_B_KEY env var required for live mode${C.R}`)
    console.error(`  ${C.gray}Set a funded wallet private key for Agent B`)
    console.error(`  Or use --simulate for demo mode${C.R}`)
    process.exit(1)
  }

  const { Wallet, JsonRpcProvider } = await import('ethers')
  const { createX402Client } = await import('../src/x402/client.js')

  const rpcUrl = process.env.ETH_RPC_URL || 'https://arb1.arbitrum.io/rpc'
  const provider = new JsonRpcProvider(rpcUrl)
  const wallet = new Wallet(AGENT_B_KEY, provider)
  const network = await provider.getNetwork()

  box('Live Mode', [
    `${C.gray}Agent B Wallet:${C.R} ${wallet.address}`,
    `${C.gray}Chain:${C.R}          ${Number(network.chainId)}`,
    `${C.gray}Agent A:${C.R}        ${BASE}`
  ])

  const x402 = createX402Client({
    wallet,
    chainId: Number(network.chainId),
    network: `eip155:${network.chainId}`
  })
  ok('x402 payment client initialized')

  const paidFetch = x402.fetch

  // Step 1: Discover
  step(1, 'Discover Agent A capabilities (free)')
  agentB(`GET ${BASE}/api/skills`)
  const skillsRes = await fetch(`${BASE}/api/skills`)
  const skills = await skillsRes.json()
  ok(`Found: ${skills.name} — ${skills.skills.length} skills, ${skills.wdkModules?.integrated}/8 WDK`)

  // Step 2: Paid snapshot
  step(2, 'Request portfolio snapshot (paid: $0.01 USDT0)')
  agentB(`GET ${BASE}/api/snapshot (via paidFetch)`)
  try {
    const res = await paidFetch(`${BASE}/api/snapshot`)
    if (res.status === 200) {
      const snap = await res.json()
      ok('Payment accepted!')
      box('Portfolio Snapshot', [
        `${C.gray}Address:${C.R}  ${snap.address}`,
        `${C.gray}Strategy:${C.R} ${snap.strategy?.name}`,
        `${C.gray}Balances:${C.R} ${JSON.stringify(snap.balances)}`
      ], C.green)
    } else if (res.status === 402) {
      console.log(`  ${C.red}402 — insufficient USDT0 balance${C.R}`)
    } else {
      console.log(`  ${C.red}Unexpected: ${res.status}${C.R}`)
    }
  } catch (e) {
    console.log(`  ${C.red}Error: ${e.message}${C.R}`)
  }

  // Step 3: Revenue
  step(3, 'Check Agent A revenue')
  const revRes = await fetch(`${BASE}/api/x402/revenue`)
  const rev = await revRes.json()
  ok(`Revenue: $${rev.totalRevenueUSD} from ${rev.totalPayments} payments`)

  console.log(`\n  ${C.B}${C.green}Demo complete.${C.R}\n`)
}

// ─── Main ───
try {
  if (SIMULATE) await runSimulated()
  else await runLive()
} catch (e) {
  console.error(`\n  ${C.red}${C.B}Demo failed: ${e.message}${C.R}\n`)
  process.exit(1)
}
