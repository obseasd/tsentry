import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateToken, validateAmount, validateAddress, validateChain, VALID_TOKENS, VALID_STRATEGIES } from './validation.js'

describe('Input Validation', () => {
  // ─── Token ───
  it('validateToken accepts valid tokens', () => {
    for (const t of VALID_TOKENS) {
      assert.equal(validateToken(t), null, `${t} should be valid`)
    }
  })

  it('validateToken rejects invalid tokens', () => {
    assert.ok(validateToken('SHIB'))
    assert.ok(validateToken(''))
    assert.ok(validateToken(null))
    assert.ok(validateToken(123))
    assert.ok(validateToken('<script>'))
  })

  // ─── Amount ───
  it('validateAmount accepts valid amounts', () => {
    assert.equal(validateAmount(100), null)
    assert.equal(validateAmount('0.001'), null)
    assert.equal(validateAmount('max'), null)
    assert.equal(validateAmount(999999999999), null)
  })

  it('validateAmount rejects invalid amounts', () => {
    assert.ok(validateAmount(0))
    assert.ok(validateAmount(-5))
    assert.ok(validateAmount('abc'))
    assert.ok(validateAmount(null))
    assert.ok(validateAmount(''))
    assert.ok(validateAmount(2e12))
  })

  // ─── Address ───
  it('validateAddress accepts valid ETH addresses', () => {
    assert.equal(validateAddress('0x0000000000000000000000000000000000000001'), null)
    assert.equal(validateAddress('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'), null)
  })

  it('validateAddress rejects invalid addresses', () => {
    assert.ok(validateAddress('0x123'))
    assert.ok(validateAddress('not-an-address'))
    assert.ok(validateAddress(null))
    assert.ok(validateAddress(''))
    assert.ok(validateAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG'))
  })

  // ─── Chain ───
  it('validateChain accepts valid chain names', () => {
    assert.equal(validateChain('ethereum'), null)
    assert.equal(validateChain('arbitrum'), null)
    assert.equal(validateChain('base-mainnet'), null)
    assert.equal(validateChain('polygon_zkevm'), null)
  })

  it('validateChain rejects invalid chain names', () => {
    assert.ok(validateChain(''))
    assert.ok(validateChain(null))
    assert.ok(validateChain('a'.repeat(31)))
    assert.ok(validateChain('chain with spaces'))
    assert.ok(validateChain('<script>alert(1)</script>'))
  })

  // ─── Strategy whitelist ───
  it('VALID_STRATEGIES has all 5 strategies', () => {
    assert.equal(VALID_STRATEGIES.length, 5)
    assert.ok(VALID_STRATEGIES.includes('USDT_YIELD'))
    assert.ok(VALID_STRATEGIES.includes('TETHER_DIVERSIFIED'))
    assert.ok(VALID_STRATEGIES.includes('CONSERVATIVE'))
    assert.ok(VALID_STRATEGIES.includes('BALANCED'))
    assert.ok(VALID_STRATEGIES.includes('AGGRESSIVE'))
  })
})
