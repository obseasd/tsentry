// Tsentry — x402 Payment Server
// Express middleware for HTTP 402 payment-gated endpoints using t402 protocol
// Accepts USDT0 payments via EIP-3009 transferWithAuthorization (gasless for clients)

import { HTTPFacilitatorClient } from '@t402/core/http'
import { t402ResourceServer } from '@t402/core/server'
import { registerExactEvmScheme } from '@t402/evm/exact/server'
import { paymentMiddleware } from '@t402/express'

// Default pricing (USDT — 6 decimals)
const PRICING = {
  snapshot: '10000',      // $0.01 — full agent data dump
  execute_swap: '100000', // $0.10 — execute on-chain swap
  execute_bridge: '100000', // $0.10 — execute cross-chain bridge
  llm_reason: '50000',    // $0.05 — LLM reasoning
  premium_read: '5000'    // $0.005 — premium read endpoints
}

/**
 * Create x402 payment middleware for Express
 *
 * @param {object} config
 * @param {string} config.network - EIP-155 network (e.g., "eip155:42161" for Arbitrum)
 * @param {string} config.tokenAddress - Payment token address (USDT0)
 * @param {string} [config.facilitatorUrl] - Facilitator endpoint
 * @param {object} [config.pricing] - Custom pricing overrides
 * @returns {{ middleware: Function, resourceServer: t402ResourceServer, config: object }}
 */
export function createX402Middleware (config) {
  const {
    network,
    tokenAddress,
    facilitatorUrl = 'https://facilitator.t402.io',
    pricing = {}
  } = config

  const prices = { ...PRICING, ...pricing }

  // Payment-gated routes (scheme: 'exact' = EIP-3009 transferWithAuthorization)
  const scheme = 'exact'
  const routes = {
    'GET /api/snapshot': {
      accepts: [{ scheme, network, token: tokenAddress, maxAmountRequired: prices.snapshot }],
      description: 'Full agent snapshot with balances, positions, and strategy'
    },
    'POST /api/swap/execute': {
      accepts: [{ scheme, network, token: tokenAddress, maxAmountRequired: prices.execute_swap }],
      description: 'Execute on-chain token swap via Velora/Uniswap'
    },
    'POST /api/bridge/execute': {
      accepts: [{ scheme, network, token: tokenAddress, maxAmountRequired: prices.execute_bridge }],
      description: 'Execute cross-chain USDT0 bridge via LayerZero'
    },
    'POST /api/llm/reason': {
      accepts: [{ scheme, network, token: tokenAddress, maxAmountRequired: prices.llm_reason }],
      description: 'AI-powered market analysis and strategy reasoning'
    }
  }

  // Create resource server with facilitator
  const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl })
  const resourceServer = new t402ResourceServer(facilitator)
  registerExactEvmScheme(resourceServer)

  // Create Express middleware
  const mw = paymentMiddleware(routes, resourceServer)

  return {
    middleware: mw,
    resourceServer,
    config: {
      network,
      tokenAddress,
      facilitatorUrl,
      pricing: prices,
      routes: Object.keys(routes)
    }
  }
}

/**
 * Get x402 info for status/dashboard
 */
export function getX402Info (x402) {
  if (!x402) return { enabled: false }
  return {
    enabled: true,
    ...x402.config
  }
}
