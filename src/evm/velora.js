// Tsentry — Velora Swap Module (WDK-native DEX Aggregator)
// Uses @tetherto/wdk-protocol-swap-velora-evm for 160+ DEX aggregation
// Supports: Ethereum, Arbitrum, Polygon, BSC, Base, Optimism, Avalanche, Fantom

import VeloraProtocolEvm from '@tetherto/wdk-protocol-swap-velora-evm'
import { constructSimpleSDK } from '@velora-dex/sdk'
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
    this.signer = config.signer || null // ethers.js signer for direct tx
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

    // Direct ParaSwap SDK for quotes (WDK module omits srcDecimals/destDecimals)
    if (this._chainId) {
      this._paraswap = constructSimpleSDK({ fetch, chainId: this._chainId })
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

    // Use direct ParaSwap SDK with srcDecimals/destDecimals (WDK module omits them)
    const amountWei = side === 'sell'
      ? ethers.parseUnits(amount.toString(), tokenIn.decimals).toString()
      : ethers.parseUnits(amount.toString(), tokenOut.decimals).toString()

    const priceRoute = await this._paraswap.swap.getRate({
      srcToken: tokenIn.address,
      destToken: tokenOut.address,
      amount: amountWei,
      side: side === 'sell' ? 'SELL' : 'BUY',
      srcDecimals: tokenIn.decimals,
      destDecimals: tokenOut.decimals
    })

    const amountIn = parseFloat(ethers.formatUnits(priceRoute.srcAmount, tokenIn.decimals))
    const amountOut = parseFloat(ethers.formatUnits(priceRoute.destAmount, tokenOut.decimals))

    return {
      tokenIn: tokenInSymbol,
      tokenOut: tokenOutSymbol,
      amountIn: side === 'sell' ? amount : amountIn,
      amountOut: side === 'sell' ? amountOut : amount,
      gasCost: priceRoute.gasCost || '0',
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

    // Get price route with decimals (direct ParaSwap SDK)
    const priceRoute = await this._paraswap.swap.getRate({
      srcToken: tokenIn.address,
      destToken: tokenOut.address,
      amount: amountInWei.toString(),
      side: 'SELL',
      srcDecimals: tokenIn.decimals,
      destDecimals: tokenOut.decimals
    })

    // Build swap tx via ParaSwap
    const address = await this.wdkAccount.getAddress()
    const swapTx = await this._paraswap.swap.buildTx({
      srcToken: priceRoute.srcToken,
      destToken: priceRoute.destToken,
      srcAmount: priceRoute.srcAmount,
      destAmount: priceRoute.destAmount,
      srcDecimals: tokenIn.decimals,
      destDecimals: tokenOut.decimals,
      userAddress: address,
      priceRoute,
      partner: 'wdk'
    }, { ignoreChecks: true })

    // Approve token spending if needed
    const signer = this.signer
    if (!signer) throw new Error('No ethers.js signer available — pass signer in VeloraSwap config')
    const tokenContract = new ethers.Contract(tokenIn.address, [
      'function allowance(address,address) view returns (uint256)',
      'function approve(address,uint256) returns (bool)'
    ], signer)

    const allowance = await tokenContract.allowance(address, swapTx.to)
    if (allowance < amountInWei) {
      const approveTx = await tokenContract.approve(swapTx.to, ethers.MaxUint256)
      await approveTx.wait()
    }

    // Send swap transaction
    const tx = await signer.sendTransaction({
      to: swapTx.to,
      data: swapTx.data,
      value: swapTx.value ? BigInt(swapTx.value) : 0n,
      gasLimit: swapTx.gas ? BigInt(swapTx.gas) : undefined
    })
    const receipt = await tx.wait()

    const amountOut = parseFloat(ethers.formatUnits(priceRoute.destAmount, tokenOut.decimals))

    return {
      tx: receipt.hash,
      amountIn: amount,
      amountOut,
      gasUsed: receipt.gasUsed?.toString(),
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
