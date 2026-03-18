// Tsentry — Demo Mode
// Returns realistic mock data when DEMO_MODE=true
// Allows judges to see full dashboard without needing funded wallets or working Aave

const DEMO_ADDRESS = '0x8193e7eCCBDeCb04AAEF4703A6E7fa4975833965'
const DEMO_START = Date.now()

const demoBalances = { ETH: 0.0842, USDT: 1247.50, USDC: 350.00, DAI: 0, WETH: 0.025 }
const demoSupplied = { USDT: 2500.00, USDC: 500.00, DAI: 0, WETH: 0 }
const demoPrices = { ETH: 2614.82, USDT: 1.0, USDC: 1.0, DAI: 1.0, WETH: 2614.82 }
const demoAPYs = { USDT: 4.82, USDC: 3.67, DAI: 5.11, WETH: 1.94 }

let demoCycle = 0
let demoActive = false
let demoPaused = false
const demoActions = []
const demoRules = []
let demoStrategy = { name: 'USDT_YIELD', allocations: { lending: 80, reserve: 20 } }

function totalPortfolio () {
  let total = 0
  for (const [tk, amt] of Object.entries(demoBalances)) {
    total += amt * (demoPrices[tk] || 0)
  }
  for (const [tk, amt] of Object.entries(demoSupplied)) {
    total += amt * (demoPrices[tk] || 0)
  }
  return total
}

function demoLog (type, msg, detail) {
  demoActions.unshift({ type, message: msg, detail, ts: new Date().toISOString() })
  if (demoActions.length > 50) demoActions.pop()
}

// Pre-seed some actions
demoLog('supply', 'Supplied 500 USDT to Aave V3', { token: 'USDT', amount: 500, hash: '0xdemo...abc1' })
demoLog('cycle', 'Cycle #3 — AI recommended holding position', { reasoning: 'APY stable, no rebalancing needed' })
demoLog('supply', 'Supplied 2000 USDT to Aave V3', { token: 'USDT', amount: 2000, hash: '0xdemo...abc2' })
demoLog('swap', 'Swapped 100 USDC → 0.038 WETH', { tokenIn: 'USDC', tokenOut: 'WETH', amountIn: 100, amountOut: 0.038 })
demoLog('init', 'Agent initialized — USDT Yield strategy', { strategy: 'USDT_YIELD' })

export function isDemoMode () {
  return process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1'
}

export function getDemoStatus () {
  return {
    name: 'Tsentry',
    version: '0.1.0',
    address: DEMO_ADDRESS,
    walletSource: 'wdk',
    wdkInfo: { derivation: "m/44'/60'/0'/0/0", source: 'BIP-44 (demo)' },
    active: demoActive,
    paused: demoPaused,
    cycle: demoCycle,
    strategy: demoStrategy.name,
    swapProvider: 'velora',
    lendingPct: 80,
    uptime: (Date.now() - DEMO_START) / 1000,
    chain: { name: 'Ethereum Sepolia', chainId: 11155111, type: 'testnet' },
    demo: true
  }
}

export function getDemoPortfolio () {
  const walletUSD = Object.entries(demoBalances).reduce((s, [t, a]) => s + a * (demoPrices[t] || 0), 0)
  const suppliedUSD = Object.entries(demoSupplied).reduce((s, [t, a]) => s + a * (demoPrices[t] || 0), 0)
  return {
    balances: demoBalances,
    supplied: demoSupplied,
    aaveAccount: { totalCollateralBase: 3000e8, totalDebtBase: 0, availableBorrowsBase: 2400e8, healthFactor: '115792089237316195423570985008687907853269984665640564039457584007913129639935' },
    aaveAPYs: demoAPYs,
    portfolio: { walletUSD: walletUSD.toFixed(2), suppliedUSD: suppliedUSD.toFixed(2), totalUSD: totalPortfolio().toFixed(2) },
    prices: demoPrices,
    lendingPct: 80,
    demo: true
  }
}

export function getDemoActions () {
  return {
    actions: demoActions,
    errors: [],
    demo: true
  }
}

export function getDemoSnapshot () {
  return {
    ...getDemoStatus(),
    ...getDemoPortfolio(),
    recentActions: demoActions,
    recentErrors: [],
    reasoningTrail: getDemoReasoningTrail(),
    swapProvider: 'velora',
    bridgeChains: ['ethereum', 'arbitrum', 'base', 'berachain', 'ink', 'unichain'],
    bridgeRoutes: 26,
    demo: true
  }
}

export function getDemoReasoning () {
  return {
    trail: getDemoReasoningTrail(),
    nextCheck: { at: new Date(Date.now() + 55000).toISOString(), intervalMs: 60000, reason: 'AI suggested 60s — stable market' },
    cycle: demoCycle,
    llm: {
      enabled: true,
      connected: true,
      lastDecision: {
        reasoning: 'Portfolio well-positioned. USDT yield at 4.82% APY in Aave V3 is competitive. No rebalancing needed — current lending allocation (80%) matches USDT_YIELD strategy target. Health factor is safe (no borrows). Recommend maintaining current positions.',
        market_assessment: 'neutral',
        risk_level: 'low',
        next_check_suggestion: '60s',
        actions: [
          { type: 'hold', token: 'USDT', reason: 'APY stable at 4.82%, above threshold', confidence: 0.92 }
        ],
        _meta: { latencyMs: 847, inputTokens: 1240, outputTokens: 385 }
      },
      model: 'claude-haiku-4-5-20251001'
    },
    demo: true
  }
}

function getDemoReasoningTrail () {
  const now = Date.now()
  return [
    { ts: new Date(now - 5000).toISOString(), phase: 'refresh', message: 'Fetched balances: ETH=0.084, USDT=1247.5, USDC=350.0' },
    { ts: new Date(now - 4000).toISOString(), phase: 'refresh', message: 'Aave positions: USDT supplied=$2,500 (4.82% APY), USDC=$500 (3.67%)' },
    { ts: new Date(now - 3000).toISOString(), phase: 'evaluate', message: 'Lending allocation: 80.1% (target: 80%) — within drift threshold' },
    { ts: new Date(now - 2000).toISOString(), phase: 'llm', message: 'Claude Haiku: HOLD — APY stable, no rebalancing needed', detail: { confidence: 0.92, risk: 'low' } },
    { ts: new Date(now - 1000).toISOString(), phase: 'complete', message: 'Cycle complete — no actions taken. Next check in 60s.' }
  ]
}

export function getDemoModules () {
  return {
    total: 8,
    modules: [
      { id: 'wallet', name: 'WDK Wallet', pkg: '@tetherto/wdk-wallet-evm', active: true, detail: 'BIP-44 0x8193e7eC...' },
      { id: 'erc4337', name: 'ERC-4337', pkg: '@tetherto/wdk-wallet-evm-erc-4337', active: false, detail: 'Not configured (needs bundler URL)' },
      { id: 'swap', name: 'Velora DEX', pkg: '@tetherto/wdk-protocol-swap-velora-evm', active: true, detail: '160+ protocols aggregated' },
      { id: 'lending', name: 'Aave V3', pkg: '@tetherto/wdk-protocol-lending-aave-evm', active: true, detail: 'Pool 0x6Ae43d3...' },
      { id: 'bridge', name: 'USDT0 Bridge', pkg: '@tetherto/wdk-protocol-bridge-usdt0-evm', active: true, detail: '26 chains (LayerZero V2)' },
      { id: 'mcp', name: 'MCP Toolkit', pkg: '@tetherto/wdk-mcp-toolkit', active: true, detail: '44 tools via OpenClaw' },
      { id: 'skills', name: 'Agent Skills', pkg: '@tetherto/wdk-agent-skills', active: true, detail: 'Interop standard' },
      { id: 'x402', name: 'x402 Payments', pkg: '@t402/wdk', active: true, detail: 'USDT0 on eip155:42161' }
    ],
    demo: true
  }
}

export function getDemoHealth () {
  return {
    status: 'ok',
    version: '0.1.0',
    uptime: Math.round((Date.now() - DEMO_START) / 1000),
    wallet: true,
    modules: { wallet: true, aave: true, swap: true, bridge: true, erc4337: false, x402: true, llm: true, mcp: true },
    agent: { active: demoActive, paused: demoPaused, cycle: demoCycle },
    memory: '42MB',
    demo: true
  }
}

export function getDemoRules () {
  if (demoRules.length === 0) {
    demoRules.push({
      id: 'demo-rule-1',
      description: 'If USDT APY drops below 3%, withdraw all and swap to USDC',
      conditions: [{ type: 'apr_drop', token: 'USDT', value: 3 }],
      actions: [{ type: 'withdraw', token: 'USDT', amount: 'max' }, { type: 'swap', tokenIn: 'USDT', tokenOut: 'USDC', amount: 'max' }],
      oneShot: false,
      active: true,
      triggeredCount: 0,
      createdAt: new Date(Date.now() - 3600000).toISOString()
    })
  }
  return { rules: demoRules, demo: true }
}

export function getDemoSwapPairs () {
  return {
    pairs: ['USDT/USDC', 'USDT/WETH', 'USDT/DAI', 'USDC/WETH', 'USDC/DAI', 'WETH/DAI'],
    provider: 'velora',
    demo: true
  }
}

export function getDemoBridgeChains () {
  return {
    chains: ['ethereum', 'arbitrum', 'base', 'optimism', 'polygon', 'berachain', 'ink', 'unichain', 'sei', 'mantle', 'scroll', 'linea', 'zksync', 'blast', 'mode', 'fraxtal', 'kroma', 'taiko', 'flare', 'iota', 'plume', 'apechain', 'abstract', 'superposition', 'form', 'hemi'],
    routes: 26,
    demo: true
  }
}

export function getDemoLlm () {
  return {
    enabled: true,
    connected: true,
    model: 'claude-haiku-4-5-20251001',
    lastDecision: getDemoReasoning().llm.lastDecision,
    demo: true
  }
}

export function getDemoErc4337 () {
  return { enabled: false, reason: 'ERC4337_BUNDLER_URL not set — optional module', demo: true }
}

export function getDemoX402 () {
  return {
    enabled: true,
    network: 'eip155:42161',
    facilitator: 'https://facilitator.t402.io',
    gatedRoutes: ['/api/snapshot', '/api/swap/execute', '/api/bridge/execute', '/api/llm/reason'],
    pricing: { '/api/snapshot': '0.01 USDT0', '/api/swap/execute': '0.05 USDT0', '/api/bridge/execute': '0.05 USDT0', '/api/llm/reason': '0.02 USDT0' },
    demo: true
  }
}

export function getDemoX402Revenue () {
  return {
    totalPayments: 12,
    totalRevenue: '0.47',
    currency: 'USDT0',
    recentPayments: [
      { route: '/api/snapshot', amount: '0.01', ts: new Date(Date.now() - 120000).toISOString() },
      { route: '/api/llm/reason', amount: '0.02', ts: new Date(Date.now() - 300000).toISOString() }
    ],
    demo: true
  }
}

export function getDemoHistory () {
  return {
    enabled: true,
    transfers: [
      { type: 'supply', token: 'USDT', amount: '500', hash: '0xdemo1...', timestamp: new Date(Date.now() - 600000).toISOString() },
      { type: 'swap', tokenIn: 'USDC', tokenOut: 'WETH', amountIn: '100', amountOut: '0.038', hash: '0xdemo2...', timestamp: new Date(Date.now() - 1200000).toISOString() }
    ],
    demo: true
  }
}

export function getDemoSkills () {
  return {
    name: 'tsentry', version: '0.1.0',
    description: 'Autonomous Multi-Chain Treasury Agent powered by Tether WDK',
    wdkModules: { total: 8, integrated: 8 },
    demo: true
  }
}

export function getDemoCreditScore (address) {
  // Generate deterministic but varied scores based on address
  const seed = parseInt((address || DEMO_ADDRESS).slice(-6), 16) % 100
  const score = Math.min(95, Math.max(15, seed + 20))
  const tier = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor'
  return {
    address: address || DEMO_ADDRESS,
    score,
    tier,
    maxLoanUSD: score >= 80 ? 10000 : score >= 60 ? 5000 : score >= 40 ? 1000 : 0,
    suggestedAPR: score >= 80 ? 3.5 : score >= 60 ? 5.0 : score >= 40 ? 8.0 : 15.0,
    dimensions: {
      walletAge: { score: Math.min(20, seed / 5 + 5), max: 20, detail: `${30 + seed} days` },
      txCount: { score: Math.min(20, seed / 4), max: 20, detail: `${10 + seed * 2} transactions` },
      balanceStability: { score: Math.min(20, 8 + seed / 10), max: 20, detail: 'Moderate stability' },
      aavePosition: { score: Math.min(20, seed / 6), max: 20, detail: score > 50 ? 'Active supplier' : 'No positions' },
      healthFactor: { score: Math.min(20, 15), max: 20, detail: 'No borrows (safe)' }
    },
    recommendation: tier === 'excellent' ? 'Prime borrower — eligible for unsecured lending'
      : tier === 'good' ? 'Reliable — standard collateral requirements'
      : tier === 'fair' ? 'Moderate risk — higher collateral recommended'
      : 'High risk — lending not recommended',
    demo: true
  }
}

export function handleDemoSupply (token, amount) {
  const amt = parseFloat(amount)
  if (demoBalances[token] !== undefined && demoBalances[token] >= amt) {
    demoBalances[token] -= amt
    demoSupplied[token] = (demoSupplied[token] || 0) + amt
    demoCycle++
    demoLog('supply', `Supplied ${amt} ${token} to Aave V3`, { token, amount: amt, hash: `0xdemo...${Date.now().toString(16).slice(-6)}` })
    return { ok: true, hash: `0xdemo${Date.now().toString(16)}`, amount: amt, token, demo: true }
  }
  return { ok: false, error: `Insufficient ${token} balance (demo)`, demo: true }
}

export function handleDemoWithdraw (token, amount) {
  const amt = amount === 'max' ? (demoSupplied[token] || 0) : parseFloat(amount)
  if (demoSupplied[token] !== undefined && demoSupplied[token] >= amt) {
    demoSupplied[token] -= amt
    demoBalances[token] = (demoBalances[token] || 0) + amt
    demoCycle++
    demoLog('withdraw', `Withdrew ${amt} ${token} from Aave V3`, { token, amount: amt, hash: `0xdemo...${Date.now().toString(16).slice(-6)}` })
    return { ok: true, hash: `0xdemo${Date.now().toString(16)}`, amount: amt, token, demo: true }
  }
  return { ok: false, error: `Insufficient ${token} supplied (demo)`, demo: true }
}

export function handleDemoStart () {
  demoActive = true
  demoPaused = false
  return { ok: true, active: true, demo: true }
}

export function handleDemoStop () {
  demoActive = false
  return { ok: true, active: false, demo: true }
}

export function handleDemoPause () {
  demoPaused = !demoPaused
  return { ok: true, paused: demoPaused, demo: true }
}

export function handleDemoCycle () {
  demoCycle++
  demoLog('cycle', `Cycle #${demoCycle} — AI analyzed treasury, holding position`, { reasoning: 'APY stable, allocation on target' })
  return { ok: true, snapshot: getDemoSnapshot(), demo: true }
}

export function handleDemoStrategy (name) {
  const strategies = {
    CONSERVATIVE: { name: 'CONSERVATIVE', allocations: { lending: 50, reserve: 50 } },
    BALANCED: { name: 'BALANCED', allocations: { lending: 65, reserve: 35 } },
    AGGRESSIVE: { name: 'AGGRESSIVE', allocations: { lending: 90, reserve: 10 } },
    USDT_YIELD: { name: 'USDT_YIELD', allocations: { lending: 80, reserve: 20 } },
    TETHER_DIVERSIFIED: { name: 'TETHER_DIVERSIFIED', allocations: { lending: 60, reserve: 25, bridge: 15 } }
  }
  demoStrategy = strategies[name?.toUpperCase()] || strategies.USDT_YIELD
  return { ok: true, strategy: demoStrategy, demo: true }
}
