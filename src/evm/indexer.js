// Tsentry — WDK Indexer Integration
// Transaction history via @tetherto/wdk-indexer-http

import WdkIndexerClient from '@tetherto/wdk-indexer-http'

/**
 * Create WDK Indexer client for transaction history
 * Requires WDK_INDEXER_API_KEY env var
 *
 * @param {object} [opts]
 * @param {string} [opts.apiKey] - Indexer API key
 * @param {string} [opts.baseUrl] - Indexer base URL
 * @returns {object|null} Indexer wrapper or null if not configured
 */
export function createIndexer (opts = {}) {
  const apiKey = opts.apiKey || process.env.WDK_INDEXER_API_KEY
  if (!apiKey) return null

  const client = new WdkIndexerClient({
    apiKey,
    baseUrl: opts.baseUrl || process.env.WDK_INDEXER_URL || 'https://indexer.tether.io'
  })

  return {
    client,

    /**
     * Get recent token transfers for an address
     * @param {string} address - Wallet address
     * @param {object} [opts]
     * @param {string} [opts.tokenAddress] - Filter by token
     * @param {number} [opts.limit] - Max results (default 20)
     * @param {number} [opts.chainId] - Chain ID
     * @returns {Promise<Array>} Transfer history
     */
    async getTransfers (address, opts = {}) {
      try {
        const result = await client.getTokenTransfers({
          address,
          tokenAddress: opts.tokenAddress,
          limit: opts.limit || 20,
          chainId: opts.chainId
        })
        return result?.transfers || result || []
      } catch (e) {
        console.error(`[indexer] getTransfers failed: ${e.message}`)
        return []
      }
    },

    /**
     * Get token balances via indexer (cross-chain)
     * @param {string} address - Wallet address
     * @param {Array<{chainId: number, tokenAddress: string}>} tokens - Tokens to query
     * @returns {Promise<Array>} Token balances
     */
    async getBalances (address, tokens) {
      try {
        const result = await client.getBatchTokenBalances({
          address,
          tokens
        })
        return result?.balances || result || []
      } catch (e) {
        console.error(`[indexer] getBalances failed: ${e.message}`)
        return []
      }
    },

    /** Health check */
    async health () {
      try {
        const result = await client.health()
        return { ok: true, ...result }
      } catch (e) {
        return { ok: false, error: e.message }
      }
    },

    /** Status info */
    getInfo () {
      return {
        enabled: true,
        baseUrl: opts.baseUrl || process.env.WDK_INDEXER_URL || 'https://indexer.tether.io'
      }
    }
  }
}
