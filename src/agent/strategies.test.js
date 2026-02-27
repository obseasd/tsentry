import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { STRATEGIES, CONSERVATIVE, BALANCED, AGGRESSIVE, USDT_YIELD } from './strategies.js'

describe('Strategies', () => {
  it('exports 4 strategies', () => {
    assert.equal(Object.keys(STRATEGIES).length, 4)
    assert.ok(STRATEGIES.CONSERVATIVE)
    assert.ok(STRATEGIES.BALANCED)
    assert.ok(STRATEGIES.AGGRESSIVE)
    assert.ok(STRATEGIES.USDT_YIELD)
  })

  it('allocations sum to 100% for all strategies', () => {
    for (const [name, strat] of Object.entries(STRATEGIES)) {
      const { lending, liquidity, reserve } = strat.allocations
      assert.equal(lending + liquidity + reserve, 100, `${name} allocations should sum to 100`)
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
