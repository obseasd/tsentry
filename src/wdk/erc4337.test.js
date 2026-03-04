import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Erc4337Adapter } from './erc4337-adapter.js'

describe('Erc4337Adapter', () => {
  it('constructs with correct config', () => {
    const adapter = new Erc4337Adapter({
      seed: 'test test test test test test test test test test test junk',
      rpcUrl: 'https://sepolia.drpc.org',
      chainId: 11155111,
      bundlerUrl: 'https://api.pimlico.io/v2/sepolia/rpc?apikey=test'
    })

    assert.equal(adapter.chainId, 11155111)
    assert.equal(adapter.rpcUrl, 'https://sepolia.drpc.org')
    assert.equal(adapter.mode, 'native')
    assert.equal(adapter.smartAddress, null) // not yet initialized
    assert.equal(adapter.paymasterConfig, null)
  })

  it('selects native mode without paymaster config', () => {
    const adapter = new Erc4337Adapter({
      seed: 'test',
      rpcUrl: 'https://sepolia.drpc.org',
      chainId: 11155111,
      bundlerUrl: 'https://bundler.example.com'
    })

    assert.equal(adapter.mode, 'native')
  })

  it('selects paymaster mode with full paymaster config', () => {
    const adapter = new Erc4337Adapter({
      seed: 'test',
      rpcUrl: 'https://sepolia.drpc.org',
      chainId: 11155111,
      bundlerUrl: 'https://bundler.example.com',
      paymaster: {
        url: 'https://paymaster.example.com',
        address: '0x1234567890123456789012345678901234567890',
        tokenAddress: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0'
      }
    })

    // Mode set during init(), but config stored immediately
    assert.ok(adapter.paymasterConfig)
    assert.equal(adapter.paymasterConfig.url, 'https://paymaster.example.com')
  })

  it('getInfo returns correct structure before init', () => {
    const adapter = new Erc4337Adapter({
      seed: 'test',
      rpcUrl: 'https://sepolia.drpc.org',
      chainId: 11155111,
      bundlerUrl: 'https://api.pimlico.io/v2/sepolia/rpc?apikey=secret123'
    })

    const info = adapter.getInfo()
    assert.equal(info.enabled, true)
    assert.equal(info.chainId, 11155111)
    assert.equal(info.mode, 'native')
    assert.ok(info.bundlerUrl.includes('apikey=***'), 'API key should be masked')
    assert.ok(!info.bundlerUrl.includes('secret123'), 'real API key should not appear')
    assert.ok(info.features.includes('gasless_transfers'))
    assert.ok(info.features.includes('batched_transactions'))
  })

  it('createErc4337Adapter returns null without bundler URL', async () => {
    const origEnv = process.env.ERC4337_BUNDLER_URL
    delete process.env.ERC4337_BUNDLER_URL

    const { createErc4337Adapter } = await import('./erc4337-adapter.js')
    const result = await createErc4337Adapter('test seed', 'https://sepolia.drpc.org', 11155111)

    assert.equal(result, null)

    if (origEnv) process.env.ERC4337_BUNDLER_URL = origEnv
  })
})
