// Tsentry — x402 Payment Client
// Agent-side payment client for accessing x402-protected external services
// Wraps WDK/ethers wallet as t402 signer, auto-pays on HTTP 402 responses

import { ExactEvmScheme } from '@t402/evm/exact/client'
import { t402Client } from '@t402/core/client'
import { wrapFetchWithPayment } from '@t402/fetch'

/**
 * Create a ClientEvmSigner from an ethers.js Wallet
 * Adapts ethers signTypedData(domain, types, value) → t402 signTypedData({domain, types, primaryType, message})
 *
 * @param {import('ethers').Wallet} wallet - ethers.js wallet with signer
 * @param {number} chainId - Chain ID
 * @returns {object} ClientEvmSigner-compatible object
 */
export function createEthersSigner (wallet, chainId) {
  return {
    get address () {
      return wallet.address
    },
    async signTypedData (params) {
      const { domain, types, primaryType, message } = params
      // ethers.js signTypedData expects (domain, types, value) — no primaryType wrapper
      // Remove EIP712Domain from types if present (ethers adds it automatically)
      const filteredTypes = { ...types }
      delete filteredTypes.EIP712Domain
      return wallet.signTypedData(domain, filteredTypes, message)
    },
    getChain () {
      return `eip155:${chainId}`
    },
    getChainId () {
      return chainId
    }
  }
}

/**
 * Create x402 payment client for agent-to-agent payments
 *
 * @param {object} config
 * @param {import('ethers').Wallet} config.wallet - ethers.js wallet (signer)
 * @param {number} config.chainId - Chain ID
 * @param {string} config.network - EIP-155 network string (e.g., "eip155:42161")
 * @returns {{ client: t402Client, fetch: Function, signer: object }}
 */
export function createX402Client (config) {
  const { wallet, chainId, network } = config

  // Wrap ethers wallet as t402 ClientEvmSigner
  const signer = createEthersSigner(wallet, chainId)

  // Create t402 client with ExactEvmScheme (EIP-3009 transferWithAuthorization)
  const client = new t402Client()
  client.register(network, new ExactEvmScheme(signer))

  // Wrap native fetch — auto-pays on 402 responses
  const paidFetch = wrapFetchWithPayment(globalThis.fetch, client)

  return {
    client,
    fetch: paidFetch,
    signer
  }
}

/**
 * Get x402 client info for status/dashboard
 */
export function getX402ClientInfo (x402Client) {
  if (!x402Client) return { enabled: false }
  return {
    enabled: true,
    address: x402Client.signer.address,
    network: x402Client.signer.getChain()
  }
}
