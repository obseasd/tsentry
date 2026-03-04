import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { STRATEGIES, CONSERVATIVE, BALANCED, AGGRESSIVE, USDT_YIELD, TETHER_DIVERSIFIED } from './strategies.js'

describe('Strategies', () => {
  it('exports 5 strategies', () => {
    assert.equal(Object.keys(STRATEGIES).length, 5)
    assert.ok(STRATEGIES.CONSERVATIVE)
    assert.ok(STRATEGIES.BALANCED)
    assert.ok(STRATEGIES.AGGRESSIVE)
    assert.ok(STRATEGIES.USDT_YIELD)
    assert.ok(STRATEGIES.TETHER_DIVERSIFIED)
  })

  it('allocations sum to 100% for all strategies', () => {
    for (const [name, strat] of Object.entries(STRATEGIES)) {
      const allocs = strat.allocations
      const total = Object.values(allocs).reduce((s, v) => s + v, 0)
      assert.equal(total, 100, `${name} allocations should sum to 100`)
    }
  })

  it('CONSERVATIVE has lowest risk', () => {
    assert.ok(CONSERVATIVE.maxRisk < BALANCED.maxRisk)
    assert.ok(BALANCED.maxRisk < AGGRESSIVE.maxRisk)
  })

  it('USDT_YIELD has USDT-centric config', () => {
    assert.equal(USDT_YIELD.baseCurrency, 'USDT')
    assert.equal(USDT_YIELD.consolidateToBase, true)
    assert.equal(USDT_YIELD.lendingPriority[0], 'USDT')
    assert.ok(USDT_YIELD.minUsdtReserve >= 100)
    assert.equal(USDT_YIELD.allocations.lending, 70)
  })

  it('TETHER_DIVERSIFIED has Tether ecosystem tokens', () => {
    assert.equal(TETHER_DIVERSIFIED.baseCurrency, 'USDT')
    assert.ok(TETHER_DIVERSIFIED.tetherTokens.USAt)
    assert.ok(TETHER_DIVERSIFIED.tetherTokens.XAUt)
    assert.equal(TETHER_DIVERSIFIED.tetherTokens.USAt.type, 'tbills')
    assert.equal(TETHER_DIVERSIFIED.tetherTokens.XAUt.type, 'gold')
    assert.equal(TETHER_DIVERSIFIED.allocations.rwa, 15)
  })

  it('all strategies have required fields', () => {
    for (const [name, strat] of Object.entries(STRATEGIES)) {
      assert.ok(strat.name, `${name} should have a name`)
      assert.ok(typeof strat.targetYield === 'number', `${name} should have targetYield`)
      assert.ok(typeof strat.maxRisk === 'number', `${name} should have maxRisk`)
      assert.ok(strat.allocations, `${name} should have allocations`)
      assert.ok(typeof strat.rebalanceThreshold === 'number', `${name} should have rebalanceThreshold`)
    }
  })
})
