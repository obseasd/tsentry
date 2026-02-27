import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TreasuryAgent } from './treasury.js'

describe('TreasuryAgent', () => {
  it('constructs with default state', () => {
    const agent = new TreasuryAgent()
    assert.equal(agent.active, false)
    assert.equal(agent.paused, false)
    assert.equal(agent.llmEnabled, true)
    assert.equal(agent.pollIntervalMs, 60_000)
    assert.equal(agent._cycleCount, 0)
    assert.deepEqual(agent.balances, {})
    assert.deepEqual(agent.supplied, {})
    assert.deepEqual(agent.actionLog, [])
  })

  it('setStrategy by name', () => {
    const agent = new TreasuryAgent()
    agent.setStrategy('USDT_YIELD')
    assert.equal(agent.strategy.name, 'USDT Yield')
    assert.equal(agent.strategy.allocations.lending, 70)
    assert.equal(agent.strategy.baseCurrency, 'USDT')
  })

  it('setStrategy by config object', () => {
    const agent = new TreasuryAgent()
    agent.setStrategy({ name: 'Custom', allocations: { lending: 50, liquidity: 25, reserve: 25 }, targetYield: 5, maxRisk: 20, rebalanceThreshold: 10 })
    assert.equal(agent.strategy.name, 'Custom')
    assert.equal(agent.strategy.allocations.lending, 50)
  })

  it('setStrategy throws on unknown name', () => {
    const agent = new TreasuryAgent()
    assert.throws(() => agent.setStrategy('INVALID'), /Unknown strategy/)
  })

  it('log adds to actionLog', () => {
    const agent = new TreasuryAgent()
    agent.log('test', 'hello world', { extra: 42 })
    assert.equal(agent.actionLog.length, 1)
    assert.equal(agent.actionLog[0].type, 'test')
    assert.equal(agent.actionLog[0].message, 'hello world')
    assert.equal(agent.actionLog[0].data.extra, 42)
  })

  it('logError adds to errors', () => {
    const agent = new TreasuryAgent()
    agent.logError('test', new Error('boom'))
    assert.equal(agent.errors.length, 1)
    assert.equal(agent.errors[0].context, 'test')
    assert.equal(agent.errors[0].message, 'boom')
  })

  it('_evaluateRules returns empty without strategy', () => {
    const agent = new TreasuryAgent()
    const actions = agent._evaluateRules()
    assert.deepEqual(actions, [])
  })

  it('_evaluateRules detects low ETH', () => {
    const agent = new TreasuryAgent()
    agent.setStrategy('BALANCED')
    agent.balances = { ETH: 0.001, USDT: 500, DAI: 0, USDC: 0, WETH: 0 }
    agent.supplied = { USDT: 0, DAI: 0, USDC: 0, WETH: 0 }
    agent.prices = { ETH: { usd: 2600 } }
    agent.aaveAccount = { totalDebtUSD: 0 }

    const actions = agent._evaluateRules()
    const gasAlert = actions.find(a => a.type === 'alert' && a.reason.includes('Low ETH'))
    assert.ok(gasAlert, 'Should detect low ETH for gas')
    assert.equal(gasAlert.priority, 'high')
  })

  it('_evaluateRules proposes lending supply when drift is high', () => {
    const agent = new TreasuryAgent()
    agent.setStrategy('USDT_YIELD') // 70% lending target
    agent.balances = { ETH: 0.01, USDT: 2000, DAI: 0, USDC: 0, WETH: 0 }
    agent.supplied = { USDT: 0, DAI: 0, USDC: 0, WETH: 0 }
    agent.prices = { ETH: { usd: 2600 } }
    agent.aaveAccount = { totalDebtUSD: 0 }

    const actions = agent._evaluateRules()
    const supplyAction = actions.find(a => a.type === 'lending_supply')
    assert.ok(supplyAction, 'Should propose lending supply')
    assert.equal(supplyAction.token, 'USDT')
  })

  it('_evaluateRules proposes USDT consolidation', () => {
    const agent = new TreasuryAgent()
    agent.setStrategy('USDT_YIELD')
    agent.balances = { ETH: 0.01, USDT: 200, DAI: 800, USDC: 0, WETH: 0 }
    agent.supplied = { USDT: 1000, DAI: 0, USDC: 0, WETH: 0 }
    agent.prices = { ETH: { usd: 2600 } }
    agent.aaveAccount = { totalDebtUSD: 0 }
    agent.swapPairs = [{ tokenA: 'DAI', tokenB: 'USDT' }]

    const actions = agent._evaluateRules()
    const swapAction = actions.find(a => a.type === 'swap' && a.tokenIn === 'DAI')
    assert.ok(swapAction, 'Should propose DAI → USDT consolidation')
    assert.equal(swapAction.tokenOut, 'USDT')
  })

  it('_evaluateRules detects critical health factor', () => {
    const agent = new TreasuryAgent()
    agent.setStrategy('BALANCED')
    agent.balances = { ETH: 0.01, USDT: 100, DAI: 0, USDC: 0, WETH: 0 }
    agent.supplied = { USDT: 0, DAI: 0, USDC: 0, WETH: 0 }
    agent.prices = { ETH: { usd: 2600 } }
    agent.aaveAccount = { totalDebtUSD: 100, healthFactor: 1.1 }

    const actions = agent._evaluateRules()
    const critical = actions.find(a => a.level === 'critical')
    assert.ok(critical, 'Should detect critical health factor')
    assert.ok(critical.reason.includes('Health factor LOW'))
  })

  it('getSnapshot returns complete state', () => {
    const agent = new TreasuryAgent()
    agent.setStrategy('CONSERVATIVE')
    const snap = agent.getSnapshot()

    assert.ok('address' in snap)
    assert.ok('walletSource' in snap)
    assert.ok('active' in snap)
    assert.ok('paused' in snap)
    assert.ok('cycle' in snap)
    assert.ok('strategy' in snap)
    assert.ok('balances' in snap)
    assert.ok('supplied' in snap)
    assert.ok('llm' in snap)
    assert.ok('recentActions' in snap)
    assert.ok('recentErrors' in snap)
    assert.equal(snap.strategy.name, 'Conservative')
  })

  it('start/stop controls active state', () => {
    const agent = new TreasuryAgent()
    agent.start(999999) // long interval so it doesn't actually run
    assert.equal(agent.active, true)
    assert.equal(agent.paused, false)

    agent.stop()
    assert.equal(agent.active, false)
  })

  it('pause/resume controls paused state', () => {
    const agent = new TreasuryAgent()
    agent.pause()
    assert.equal(agent.paused, true)
    agent.resume()
    assert.equal(agent.paused, false)
  })

  it('_parseInterval converts time strings', () => {
    const agent = new TreasuryAgent()
    assert.equal(agent._parseInterval('30s'), 30_000)
    assert.equal(agent._parseInterval('5m'), 300_000)
    assert.equal(agent._parseInterval('1h'), 3_600_000)
    assert.equal(agent._parseInterval('invalid'), null)
  })
})
