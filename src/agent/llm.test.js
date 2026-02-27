import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { LlmReasoning } from './llm.js'

describe('LlmReasoning', () => {
  it('throws without API key', () => {
    const origKey = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    assert.throws(() => new LlmReasoning(), /ANTHROPIC_API_KEY required/)
    if (origKey) process.env.ANTHROPIC_API_KEY = origKey
  })

  it('constructs with explicit API key', () => {
    const llm = new LlmReasoning({ apiKey: 'test-key-123' })
    assert.equal(llm.model, 'claude-haiku-4-5-20251001')
    assert.equal(llm.maxTokens, 1024)
    assert.deepEqual(llm.history, [])
  })

  it('buildStatePrompt formats snapshot correctly', () => {
    const llm = new LlmReasoning({ apiKey: 'test-key' })
    const snapshot = {
      cycle: 5,
      strategy: { name: 'USDT Yield', allocations: { lending: 70 }, targetYield: 8, maxRisk: 30, rebalanceThreshold: 5 },
      active: true,
      paused: false,
      balances: { ETH: 0.003, USDT: 1000, DAI: 500, USDC: 200, WETH: 0 },
      supplied: { USDT: 0, DAI: 0 },
      aaveAccount: { totalCollateralUSD: 0, totalDebtUSD: 0, availableBorrowUSD: 0 },
      portfolio: { totalUSD: 1703 },
      prices: { ETH: { usd: 2600, usd_24h_change: 1.5 } },
      lendingPct: '0.0',
      swapPairs: [{ tokenA: 'USDT', tokenB: 'DAI' }],
      bridgeChains: [{ name: 'Ethereum' }, { name: 'Arbitrum' }],
      recentActions: [],
      recentErrors: []
    }

    const prompt = llm.buildStatePrompt(snapshot)

    assert.ok(prompt.includes('TREASURY STATE'))
    assert.ok(prompt.includes('Cycle: #5'))
    assert.ok(prompt.includes('USDT Yield'))
    assert.ok(prompt.includes('ETH: 0.003'))
    assert.ok(prompt.includes('USDT: 1000'))
    assert.ok(prompt.includes('USDT/DAI'))
    assert.ok(prompt.includes('Ethereum'))
    assert.ok(prompt.includes('Arbitrum'))
  })

  it('buildStatePrompt includes user instruction', () => {
    const llm = new LlmReasoning({ apiKey: 'test-key' })
    const snapshot = {
      cycle: 1, strategy: null, active: false, paused: false,
      balances: {}, supplied: {}, prices: {}, lendingPct: '0',
      swapPairs: [], bridgeChains: [], recentActions: [], recentErrors: []
    }

    const prompt = llm.buildStatePrompt(snapshot, { userInstruction: 'Focus on risk' })
    assert.ok(prompt.includes('User Instruction'))
    assert.ok(prompt.includes('Focus on risk'))
  })

  it('resetHistory clears conversation', () => {
    const llm = new LlmReasoning({ apiKey: 'test-key' })
    llm.history = [{ role: 'user', content: 'test' }]
    llm.resetHistory()
    assert.deepEqual(llm.history, [])
  })
})
