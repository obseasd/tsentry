// Tsentry — Aave V3 Lending Module (Sepolia)
// Direct interactions with Aave V3 Pool for supply/withdraw/borrow/repay

import { ethers } from 'ethers'

const POOL_ABI = [
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
  'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)',
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)'
]

const ATOKEN_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function UNDERLYING_ASSET_ADDRESS() view returns (address)'
]

// Aave V3 ProtocolDataProvider — flat return, easy to parse
const DATA_PROVIDER_ABI = [
  'function getReserveData(address asset) external view returns (uint256 unbacked, uint256 accruedToTreasuryScaled, uint256 totalAToken, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint40 lastUpdateTimestamp)'
]

// Aave V3 ProtocolDataProvider (default: Ethereum Sepolia, overridable via config)
const DEFAULT_DATA_PROVIDER = '0x3e9708d80f7B3e43118013075F7e95CE3AB31F31'

const SECONDS_PER_YEAR = 31_536_000

// Default aToken addresses (Ethereum Sepolia — overridable via config)
const DEFAULT_ATOKENS = {
  USDT: '0xAF0F6e8b0Dc5c913bbF4d14c22B4E78Dd14310B6',
  DAI: '0x29598b72eb5CeBd806C5dCD549490FdA35B13cD8',
  USDC: '0x16dA4541aD1807f4443d92D26044C1147406EB80',
  WETH: '0x5b071b590a59395fE4025A0Ccc1FcC931AAc1830'
}

export class AaveLending {
  /**
   * @param {object} config
   * @param {import('ethers').Wallet} config.signer
   * @param {string} config.poolAddress
   * @param {object} config.tokens - { symbol: { address, decimals } }
   */
  constructor (config) {
    this.signer = config.signer
    this.pool = new ethers.Contract(config.poolAddress, POOL_ABI, config.signer)
    this.poolAddress = config.poolAddress
    this.tokens = config.tokens
    this.aTokens = config.aTokens || DEFAULT_ATOKENS
    this.dataProviderAddress = config.dataProviderAddress || DEFAULT_DATA_PROVIDER
  }

  /** Get user account data from Aave */
  async getAccountData () {
    const data = await this.pool.getUserAccountData(this.signer.address)
    return {
      totalCollateralUSD: parseFloat(ethers.formatUnits(data.totalCollateralBase, 8)),
      totalDebtUSD: parseFloat(ethers.formatUnits(data.totalDebtBase, 8)),
      availableBorrowsUSD: parseFloat(ethers.formatUnits(data.availableBorrowsBase, 8)),
      liquidationThreshold: parseFloat(data.currentLiquidationThreshold.toString()) / 100,
      ltv: parseFloat(data.ltv.toString()) / 100,
      healthFactor: parseFloat(ethers.formatUnits(data.healthFactor, 18))
    }
  }

  /** Get supplied (aToken) balance for a token */
  async getSuppliedBalance (symbol) {
    const aTokenAddr = this.aTokens[symbol]
    if (!aTokenAddr) return 0
    const aToken = new ethers.Contract(aTokenAddr, ATOKEN_ABI, this.signer.provider)
    const bal = await aToken.balanceOf(this.signer.address)
    return parseFloat(ethers.formatUnits(bal, this.tokens[symbol].decimals))
  }

  /** Get all supplied balances */
  async getAllSupplied () {
    const result = {}
    for (const symbol of Object.keys(this.aTokens)) {
      if (this.tokens[symbol]) {
        result[symbol] = await this.getSuppliedBalance(symbol)
      }
    }
    return result
  }

  /**
   * Get supply APY and borrow APY for a token from Aave on-chain data
   * @param {string} symbol
   * @returns {object} { supplyAPY, borrowAPY } as percentages (e.g. 3.45 = 3.45%)
   */
  async getReserveAPY (symbol) {
    const tokenInfo = this.tokens[symbol]
    if (!tokenInfo) return { supplyAPY: 0, borrowAPY: 0 }

    try {
      const dataProvider = new ethers.Contract(
        this.dataProviderAddress, DATA_PROVIDER_ABI, this.signer.provider
      )
      const data = await dataProvider.getReserveData(tokenInfo.address)

      // liquidityRate and variableBorrowRate are in RAY (1e27)
      const supplyAPR = Number(data.liquidityRate) / 1e27
      const borrowAPR = Number(data.variableBorrowRate) / 1e27

      // Compound per-second rate to APY
      const supplyAPY = (Math.pow(1 + supplyAPR / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) * 100
      const borrowAPY = (Math.pow(1 + borrowAPR / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) * 100

      return {
        supplyAPY: parseFloat(supplyAPY.toFixed(4)),
        borrowAPY: parseFloat(borrowAPY.toFixed(4))
      }
    } catch (e) {
      console.error(`[aave] Failed to fetch APY for ${symbol}: ${e.message}`)
      return { supplyAPY: 0, borrowAPY: 0 }
    }
  }

  /**
   * Get APY for all configured tokens
   * @returns {object} { USDT: { supplyAPY, borrowAPY }, DAI: {...}, ... }
   */
  async getAllReserveAPYs () {
    const result = {}
    for (const symbol of Object.keys(this.aTokens)) {
      if (this.tokens[symbol]) {
        result[symbol] = await this.getReserveAPY(symbol)
      }
    }
    return result
  }

  /**
   * Supply token to Aave
   * @param {string} symbol - Token symbol
   * @param {number} amount - Human-readable amount
   * @returns {object} { tx, receipt, suppliedAmount }
   */
  async supply (symbol, amount) {
    const tokenInfo = this.tokens[symbol]
    if (!tokenInfo) throw new Error(`Unknown token: ${symbol}`)

    const parsed = ethers.parseUnits(amount.toString(), tokenInfo.decimals)

    // Check + approve allowance
    const erc20 = new ethers.Contract(tokenInfo.address, [
      'function allowance(address,address) view returns (uint256)',
      'function approve(address,uint256) returns (bool)'
    ], this.signer)

    const allowance = await erc20.allowance(this.signer.address, this.poolAddress)
    if (allowance < parsed) {
      const approveTx = await erc20.approve(this.poolAddress, ethers.MaxUint256)
      await approveTx.wait()
    }

    // Supply
    try {
      const tx = await this.pool.supply(tokenInfo.address, parsed, this.signer.address, 0)
      const receipt = await tx.wait()

      return {
        tx: tx.hash,
        receipt,
        suppliedAmount: amount,
        symbol,
        gasUsed: receipt.gasUsed.toString()
      }
    } catch (e) {
      // Aave V3 error codes → human-readable messages
      const aaveErrors = {
        26: 'Insufficient balance to supply',
        27: 'Invalid amount (must be > 0)',
        28: 'Reserve is not active',
        29: 'Reserve is frozen',
        51: `Supply cap exceeded for ${symbol} — try a smaller amount or different token (DAI, USDC)`
      }
      const code = e.reason?.match?.(/^(\d+)$/)?.[1]
      if (code && aaveErrors[code]) {
        throw new Error(`Aave: ${aaveErrors[code]}`)
      }
      throw e
    }
  }

  /**
   * Withdraw token from Aave
   * @param {string} symbol
   * @param {number} amount - Use Infinity or -1 for max
   * @returns {object}
   */
  async withdraw (symbol, amount) {
    const tokenInfo = this.tokens[symbol]
    if (!tokenInfo) throw new Error(`Unknown token: ${symbol}`)

    const parsed = amount === Infinity || amount === -1
      ? ethers.MaxUint256
      : ethers.parseUnits(amount.toString(), tokenInfo.decimals)

    const tx = await this.pool.withdraw(tokenInfo.address, parsed, this.signer.address)
    const receipt = await tx.wait()

    return {
      tx: tx.hash,
      receipt,
      withdrawnAmount: amount === Infinity ? 'max' : amount,
      symbol,
      gasUsed: receipt.gasUsed.toString()
    }
  }

  /**
   * Borrow token from Aave (variable rate)
   * @param {string} symbol
   * @param {number} amount
   */
  async borrow (symbol, amount) {
    const tokenInfo = this.tokens[symbol]
    if (!tokenInfo) throw new Error(`Unknown token: ${symbol}`)

    const parsed = ethers.parseUnits(amount.toString(), tokenInfo.decimals)
    // interestRateMode 2 = variable rate
    const tx = await this.pool.borrow(tokenInfo.address, parsed, 2, 0, this.signer.address)
    const receipt = await tx.wait()

    return {
      tx: tx.hash,
      receipt,
      borrowedAmount: amount,
      symbol,
      rateMode: 'variable',
      gasUsed: receipt.gasUsed.toString()
    }
  }

  /**
   * Repay borrowed token
   * @param {string} symbol
   * @param {number} amount - Use Infinity for max
   */
  async repay (symbol, amount) {
    const tokenInfo = this.tokens[symbol]
    if (!tokenInfo) throw new Error(`Unknown token: ${symbol}`)

    const parsed = amount === Infinity
      ? ethers.MaxUint256
      : ethers.parseUnits(amount.toString(), tokenInfo.decimals)

    // Approve if needed
    const erc20 = new ethers.Contract(tokenInfo.address, [
      'function allowance(address,address) view returns (uint256)',
      'function approve(address,uint256) returns (bool)'
    ], this.signer)

    const allowance = await erc20.allowance(this.signer.address, this.poolAddress)
    if (allowance < parsed) {
      const approveTx = await erc20.approve(this.poolAddress, ethers.MaxUint256)
      await approveTx.wait()
    }

    const tx = await this.pool.repay(tokenInfo.address, parsed, 2, this.signer.address)
    const receipt = await tx.wait()

    return {
      tx: tx.hash,
      receipt,
      repaidAmount: amount === Infinity ? 'max' : amount,
      symbol,
      gasUsed: receipt.gasUsed.toString()
    }
  }
}
