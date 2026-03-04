import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('x402 Server', () => {
  it('getX402Info returns disabled when null', async () => {
    const { getX402Info } = await import('./server.js')
    const info = getX402Info(null)
    assert.equal(info.enabled, false)
  })

  it('getX402Info returns enabled with config', async () => {
    const { getX402Info } = await import('./server.js')
    const info = getX402Info({
      config: {
        network: 'eip155:42161',
        tokenAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        facilitatorUrl: 'https://facilitator.t402.io',
        pricing: {
          snapshot: '10000',
          execute_swap: '100000',
          execute_bridge: '100000',
          llm_reason: '50000',
          premium_read: '5000'
        },
        routes: ['GET /api/snapshot', 'POST /api/swap/execute', 'POST /api/bridge/execute', 'POST /api/llm/reason']
      }
    })
    assert.equal(info.enabled, true)
    assert.equal(info.network, 'eip155:42161')
    assert.equal(info.tokenAddress, '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9')
    assert.equal(info.facilitatorUrl, 'https://facilitator.t402.io')
    assert.ok(info.routes.length >= 4, 'should have 4 gated routes')
    assert.equal(info.pricing.snapshot, '10000')
    assert.equal(info.pricing.execute_swap, '100000')
  })

  // Note: createX402Middleware is integration-tested by the CI boot test
  // (paymentMiddleware from @t402/express triggers async route validation
  // that can't be properly awaited in unit tests)
})

describe('x402 Revenue Tracker', () => {
  it('records payments and tracks totals', async () => {
    const { RevenueTracker } = await import('./revenue.js')
    const tracker = new RevenueTracker()

    tracker.record({ route: 'GET /api/snapshot', amount: '10000', payer: '0xAAA' })
    tracker.record({ route: 'POST /api/swap/execute', amount: '100000', payer: '0xBBB' })
    tracker.record({ route: 'GET /api/snapshot', amount: '10000', payer: '0xCCC' })

    const summary = tracker.getSummary()
    assert.equal(summary.totalPayments, 3)
    assert.equal(summary.totalRevenueUSD, 0.12) // $0.01 + $0.10 + $0.01
    assert.equal(summary.byRoute['GET /api/snapshot'].count, 2)
    assert.equal(summary.byRoute['GET /api/snapshot'].totalUSD, 0.02)
    assert.equal(summary.byRoute['POST /api/swap/execute'].count, 1)
    assert.equal(summary.recentPayments.length, 3)
  })

  it('getSince filters by timestamp', async () => {
    const { RevenueTracker } = await import('./revenue.js')
    const tracker = new RevenueTracker()

    tracker.record({ route: 'GET /api/snapshot', amount: '10000' })
    // Use a future cutoff to reliably exclude the first record
    await new Promise(r => setTimeout(r, 50))
    const cutoff = new Date().toISOString()
    await new Promise(r => setTimeout(r, 50))
    tracker.record({ route: 'POST /api/llm/reason', amount: '50000' })

    const since = tracker.getSince(cutoff)
    assert.equal(since.payments, 1)
    assert.equal(since.revenueUSD, 0.05)
  })
})

describe('x402 Client', () => {
  it('createEthersSigner wraps ethers wallet correctly', async () => {
    const { createEthersSigner } = await import('./client.js')
    const { ethers } = await import('ethers')

    const wallet = ethers.Wallet.createRandom()
    const signer = createEthersSigner(wallet, 42161)

    assert.equal(signer.address, wallet.address)
    assert.equal(signer.getChain(), 'eip155:42161')
    assert.equal(signer.getChainId(), 42161)
    assert.equal(typeof signer.signTypedData, 'function')
  })

  it('signer signTypedData filters EIP712Domain from types', async () => {
    const { createEthersSigner } = await import('./client.js')
    const { ethers } = await import('ethers')

    const wallet = ethers.Wallet.createRandom()
    const signer = createEthersSigner(wallet, 1)

    const sig = await signer.signTypedData({
      domain: { name: 'Test', version: '1', chainId: 1 },
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' }
        ],
        Message: [{ name: 'contents', type: 'string' }]
      },
      primaryType: 'Message',
      message: { contents: 'Hello' }
    })

    assert.ok(sig.startsWith('0x'), 'signature should be hex')
    assert.equal(sig.length, 132, 'signature should be 65 bytes')
  })

  it('getX402ClientInfo returns disabled when null', async () => {
    const { getX402ClientInfo } = await import('./client.js')
    const info = getX402ClientInfo(null)
    assert.equal(info.enabled, false)
  })

  it('createX402Client creates functional client', async () => {
    const { createX402Client } = await import('./client.js')
    const { ethers } = await import('ethers')

    const wallet = ethers.Wallet.createRandom()
    const client = createX402Client({
      wallet,
      chainId: 42161,
      network: 'eip155:42161'
    })

    assert.ok(client.client, 'should have t402 client')
    assert.ok(client.fetch, 'should have wrapped fetch')
    assert.ok(client.signer, 'should have signer')
    assert.equal(client.signer.address, wallet.address)
  })

  it('getX402ClientInfo returns enabled with client', async () => {
    const { createX402Client, getX402ClientInfo } = await import('./client.js')
    const { ethers } = await import('ethers')

    const wallet = ethers.Wallet.createRandom()
    const client = createX402Client({
      wallet,
      chainId: 42161,
      network: 'eip155:42161'
    })

    const info = getX402ClientInfo(client)
    assert.equal(info.enabled, true)
    assert.equal(info.address, wallet.address)
    assert.equal(info.network, 'eip155:42161')
  })
})
