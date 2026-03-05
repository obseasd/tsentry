// Tsentry — Swap Module (Uniswap V3)
// Direct token swaps via Uniswap V3 SwapRouter

import { ethers } from 'ethers'

// Uniswap V3 default addresses (Ethereum Sepolia — overridable via config)
const DEFAULT_UNISWAP = {
  SWAP_ROUTER: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
  QUOTER_V2: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
  FACTORY: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c'
}

const ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)'
]

const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
]

const FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)'
]

const POOL_ABI = [
  'function liquidity() view returns (uint128)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
]

// Common fee tiers
const FEE_TIERS = [500, 3000, 10000] // 0.05%, 0.3%, 1%

export class UniswapSwap {
  /**
   * @param {object} config
   * @param {import('ethers').Wallet} config.signer
   * @param {object} config.tokens - { symbol: { address, decimals } }
   * @param {object} [config.uniswap] - { SWAP_ROUTER, QUOTER_V2, FACTORY } overrides
   */
  constructor (config) {
    this.signer = config.signer
    this.tokens = config.tokens
    const addrs = config.uniswap || DEFAULT_UNISWAP
    this.routerAddress = addrs.SWAP_ROUTER
    this.router = new ethers.Contract(addrs.SWAP_ROUTER, ROUTER_ABI, config.signer)
    this.quoter = new ethers.Contract(addrs.QUOTER_V2, QUOTER_ABI, config.signer)
    this.factory = new ethers.Contract(addrs.FACTORY, FACTORY_ABI, config.signer.provider)
  }

  /**
   * Find the best fee tier for a token pair (one with liquidity)
   * @param {string} tokenA - address
   * @param {string} tokenB - address
   * @returns {number|null} fee tier or null
   */
  async findBestPool (tokenA, tokenB) {
    for (const fee of FEE_TIERS) {
      const poolAddr = await this.factory.getPool(tokenA, tokenB, fee)
      if (poolAddr !== ethers.ZeroAddress) {
        // Verify pool is initialized (has liquidity) — prevents LOK revert
        try {
          const pool = new ethers.Contract(poolAddr, POOL_ABI, this.signer.provider)
          const liq = await pool.liquidity()
          if (liq > 0n) return { fee, pool: poolAddr }
        } catch {
          // Pool exists but not initialized — skip
        }
      }
    }
    return null
  }

  /**
   * Quote a swap (read-only, no gas spent)
   * @param {string} tokenInSymbol
   * @param {string} tokenOutSymbol
   * @param {number} amount - human-readable
   * @param {'sell'|'buy'} side
   * @returns {object} { amountIn, amountOut, fee, pool, priceImpact }
   */
  async quote (tokenInSymbol, tokenOutSymbol, amount, side = 'sell') {
    const tokenIn = this.tokens[tokenInSymbol]
    const tokenOut = this.tokens[tokenOutSymbol]
    if (!tokenIn) throw new Error(`Unknown token: ${tokenInSymbol}`)
    if (!tokenOut) throw new Error(`Unknown token: ${tokenOutSymbol}`)

    // Find pool
    const poolInfo = await this.findBestPool(tokenIn.address, tokenOut.address)
    if (!poolInfo) throw new Error(`No Uniswap pool for ${tokenInSymbol}/${tokenOutSymbol}`)

    if (side === 'sell') {
      const amountIn = ethers.parseUnits(amount.toString(), tokenIn.decimals)
      const result = await this.quoter.quoteExactInputSingle.staticCall({
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amountIn,
        fee: poolInfo.fee,
        sqrtPriceLimitX96: 0n
      })

      return {
        tokenIn: tokenInSymbol,
        tokenOut: tokenOutSymbol,
        amountIn: amount,
        amountOut: parseFloat(ethers.formatUnits(result.amountOut, tokenOut.decimals)),
        fee: poolInfo.fee,
        pool: poolInfo.pool,
        gasEstimate: result.gasEstimate?.toString()
      }
    } else {
      const amountOut = ethers.parseUnits(amount.toString(), tokenOut.decimals)
      const result = await this.quoter.quoteExactOutputSingle.staticCall({
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amount: amountOut,
        fee: poolInfo.fee,
        sqrtPriceLimitX96: 0n
      })

      return {
        tokenIn: tokenInSymbol,
        tokenOut: tokenOutSymbol,
        amountIn: parseFloat(ethers.formatUnits(result.amountIn, tokenIn.decimals)),
        amountOut: amount,
        fee: poolInfo.fee,
        pool: poolInfo.pool,
        gasEstimate: result.gasEstimate?.toString()
      }
    }
  }

  /**
   * Execute a sell swap (exact input)
   * @param {string} tokenInSymbol
   * @param {string} tokenOutSymbol
   * @param {number} amount - amount of tokenIn to sell
   * @param {number} slippagePct - max slippage % (default 1%)
   * @returns {object} { tx, amountIn, amountOut, fee }
   */
  async sell (tokenInSymbol, tokenOutSymbol, amount, slippagePct = 1) {
    const tokenIn = this.tokens[tokenInSymbol]
    const tokenOut = this.tokens[tokenOutSymbol]
    if (!tokenIn || !tokenOut) throw new Error('Unknown token')

    // Find pool
    const poolInfo = await this.findBestPool(tokenIn.address, tokenOut.address)
    if (!poolInfo) throw new Error(`No pool for ${tokenInSymbol}/${tokenOutSymbol}`)

    const amountIn = ethers.parseUnits(amount.toString(), tokenIn.decimals)

    // Get quote for slippage calculation
    const quoteResult = await this.quoter.quoteExactInputSingle.staticCall({
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      amountIn,
      fee: poolInfo.fee,
      sqrtPriceLimitX96: 0n
    })

    const minOut = quoteResult.amountOut * BigInt(Math.floor((100 - slippagePct) * 100)) / 10000n

    // Approve router
    const erc20 = new ethers.Contract(tokenIn.address, [
      'function allowance(address,address) view returns (uint256)',
      'function approve(address,uint256) returns (bool)'
    ], this.signer)

    const allowance = await erc20.allowance(this.signer.address, this.routerAddress)
    if (allowance < amountIn) {
      const appTx = await erc20.approve(this.routerAddress, ethers.MaxUint256)
      await appTx.wait()
    }

    // Execute swap
    const tx = await this.router.exactInputSingle({
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      fee: poolInfo.fee,
      recipient: this.signer.address,
      amountIn,
      amountOutMinimum: minOut,
      sqrtPriceLimitX96: 0n
    })

    const receipt = await tx.wait()

    return {
      tx: tx.hash,
      amountIn: amount,
      amountOut: parseFloat(ethers.formatUnits(quoteResult.amountOut, tokenOut.decimals)),
      minAmountOut: parseFloat(ethers.formatUnits(minOut, tokenOut.decimals)),
      fee: poolInfo.fee,
      gasUsed: receipt.gasUsed.toString(),
      tokenIn: tokenInSymbol,
      tokenOut: tokenOutSymbol
    }
  }

  /**
   * Check which token pairs have liquidity
   * @returns {Array<object>} available pairs
   */
  async getAvailablePairs () {
    const symbols = Object.keys(this.tokens)
    const pairs = []

    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const a = symbols[i]
        const b = symbols[j]
        try {
          const poolInfo = await this.findBestPool(
            this.tokens[a].address,
            this.tokens[b].address
          )
          if (poolInfo) {
            pairs.push({ tokenA: a, tokenB: b, fee: poolInfo.fee, pool: poolInfo.pool })
          }
        } catch {
          // Skip pairs that fail (e.g. RPC error, uninitialized pool)
        }
      }
    }

    return pairs
  }
}
