// Tsentry — Velora Swap Module (WDK-native DEX Aggregator)
// Uses @tetherto/wdk-protocol-swap-velora-evm for 160+ DEX aggregation
// Supports: Ethereum, Arbitrum, Polygon, BSC, Base, Optimism, Avalanche, Fantom

import VeloraProtocolEvm from '@tetherto/wdk-protocol-swap-velora-evm'
import { ethers } from 'ethers'

// Chains supported by Velora (via ParaSwap API)
const SUPPORTED_CHAINS = new Set([1, 10, 56, 137, 250, 1101, 8453, 42161, 43114])

export class VeloraSwap {
  /**
   * @param {object} config
   * @param {object} config.wdkAccount - WDK WalletAccountEvm instance
   * @param {object} config.tokens - { symbol: { address, decimals } }
   * @param {bigint} [config.swapMaxFee] - Max gas fee in wei
   */
  constructor (config) {
    this.wdkAccount = config.wdkAccount
    this.tokens = config.tokens
    this.velora = null
    this._chainId = null
  }

  /** Initialize Velora protocol and detect chain */
  async init () {
    this.velora = new VeloraProtocolEvm(this.wdkAccount, {
      swapMaxFee: 500000000000000n // 0.0005 ETH default max fee
    })

    // Detect chain from provider
    const provider = this.wdkAccount._config.provider
    if (provider) {
      const rpcProvider = typeof provider === 'string'
        ? new ethers.JsonRpcProvider(provider)
        : provider
      const network = await rpcProvider.getNetwork()
      this._chainId = Number(network.chainId)
    }

    return this
  }

  /** Check if current chain is supported by Velora */
  isSupported () {
    return SUPPORTED_CHAINS.has(this._chainId)
  }

  /**
   * Quote a swap (read-only, no gas spent)
   * @param {string} tokenInSymbol
   * @param {string} tokenOutSymbol
   * @param {number} amount - human-readable
   * @param {'sell'|'buy'} side
   * @returns {object} { amountIn, amountOut, fee, tokenIn, tokenOut, provider }
   */
  async quote (tokenInSymbol, tokenOutSymbol, amount, side = 'sell') {
    const tokenIn = this.tokens[tokenInSymbol]
    const tokenOut = this.tokens[tokenOutSymbol]
    if (!tokenIn) throw new Error(`Unknown token: ${tokenInSymbol}`)
    if (!tokenOut) throw new Error(`Unknown token: ${tokenOutSymbol}`)

    const options = {
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address
    }

    if (side === 'sell') {
      options.tokenInAmount = ethers.parseUnits(amount.toString(), tokenIn.decimals)
    } else {
      options.tokenOutAmount = ethers.parseUnits(amount.toString(), tokenOut.decimals)
    }

    const result = await this.velora.quoteSwap(options)

    const amountIn = parseFloat(ethers.formatUnits(result.tokenInAmount, tokenIn.decimals))
    const amountOut = parseFloat(ethers.formatUnits(result.tokenOutAmount, tokenOut.decimals))

    return {
      tokenIn: tokenInSymbol,
      tokenOut: tokenOutSymbol,
      amountIn: side === 'sell' ? amount : amountIn,
      amountOut: side === 'sell' ? amountOut : amount,
      fee: parseFloat(ethers.formatEther(result.fee)),
      feeWei: result.fee.toString(),
      provider: 'velora'
    }
  }

  /**
   * Execute a sell swap (exact input) via Velora aggregator
   * @param {string} tokenInSymbol
   * @param {string} tokenOutSymbol
   * @param {number} amount - amount of tokenIn to sell
   * @param {number} slippagePct - unused (Velora handles slippage internally)
   * @returns {object} { tx, amountIn, amountOut, fee, tokenIn, tokenOut, provider }
   */
  async sell (tokenInSymbol, tokenOutSymbol, amount, slippagePct = 1) {
    const tokenIn = this.tokens[tokenInSymbol]
    const tokenOut = this.tokens[tokenOutSymbol]
    if (!tokenIn || !tokenOut) throw new Error('Unknown token')

    const amountInWei = ethers.parseUnits(amount.toString(), tokenIn.decimals)

    // Approve token spending to Velora (via WDK account)
    // First get the swap tx to find the spender (Velora proxy contract)
    // The WDK Velora module handles approval internally via account.approve()

    const result = await this.velora.swap({
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      tokenInAmount: amountInWei
    })

    const amountOut = parseFloat(ethers.formatUnits(result.tokenOutAmount, tokenOut.decimals))

    return {
      tx: result.hash,
      amountIn: amount,
      amountOut,
      fee: parseFloat(ethers.formatEther(result.fee)),
      feeWei: result.fee.toString(),
      tokenIn: tokenInSymbol,
      tokenOut: tokenOutSymbol,
      provider: 'velora'
    }
  }

  /**
   * Get available token pairs (all combinations of configured tokens)
   * On Velora, any pair is potentially available via aggregation
   * @returns {Array<object>} available pairs
   */
  async getAvailablePairs () {
    if (!this.isSupported()) return []

    const symbols = Object.keys(this.tokens)
    const pairs = []

    // Velora aggregates 160+ DEXs — all token pairs are potentially available
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        pairs.push({
          tokenA: symbols[i],
          tokenB: symbols[j],
          fee: 'aggregated',
          pool: 'velora-aggregator'
        })
      }
    }

    return pairs
  }
}

/**
 * Check if a chain ID is supported by Velora
 * @param {number} chainId
 * @returns {boolean}
 */
export function isVeloraSupported (chainId) {
  return SUPPORTED_CHAINS.has(chainId)
}
