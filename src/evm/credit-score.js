// Tsentry — On-Chain Credit Scoring Module
// Autonomous credit assessment for the Lending Bot track
// Uses on-chain history, wallet age, balance stability, and lending behavior

import { ethers } from 'ethers'

// Score weights (total = 100)
const WEIGHTS = {
  walletAge: 20,       // Older wallets = more trusted
  txHistory: 20,       // More activity = more reliable
  balanceStability: 20, // Consistent balances = less risky
  lendingHistory: 20,  // Proven borrower/lender
  collateralRatio: 20  // Healthy collateral = low default risk
}

// ERC-20 Transfer event signature
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)')

export class CreditScorer {
  /**
   * @param {object} config
   * @param {import('ethers').Provider} config.provider
   * @param {string} config.poolAddress - Aave V3 pool
   * @param {object} config.tokens - { symbol: { address, decimals } }
   */
  constructor (config) {
    this.provider = config.provider
    this.poolAddress = config.poolAddress
    this.tokens = config.tokens
  }

  /**
   * Compute credit score for an address (0-100)
   * @param {string} address - Wallet to score
   * @returns {object} { score, breakdown, risk, recommendation }
   */
  async score (address) {
    const [age, txCount, balances, aaveData] = await Promise.all([
      this._getWalletAge(address),
      this._getTxCount(address),
      this._getTokenBalances(address),
      this._getAavePosition(address)
    ])

    // 1. Wallet Age Score (0-100)
    const ageDays = age.days
    const ageScore = Math.min(100, ageDays * 0.5) // 200 days = max

    // 2. Transaction History Score (0-100)
    const txScore = Math.min(100, txCount * 2) // 50 tx = max

    // 3. Balance Stability Score (0-100)
    // Higher total balance = more stable (simplified: no multi-block check on testnet)
    const totalUSD = balances.totalUSD
    const balanceScore = Math.min(100, totalUSD * 0.1) // $1000 = max

    // 4. Lending History Score (0-100)
    const lendingScore = this._scoreLending(aaveData)

    // 5. Collateral Ratio Score (0-100)
    const collateralScore = this._scoreCollateral(aaveData)

    // Weighted total
    const score = Math.round(
      (ageScore * WEIGHTS.walletAge +
       txScore * WEIGHTS.txHistory +
       balanceScore * WEIGHTS.balanceStability +
       lendingScore * WEIGHTS.lendingHistory +
       collateralScore * WEIGHTS.collateralRatio) / 100
    )

    const breakdown = {
      walletAge: { score: Math.round(ageScore), weight: WEIGHTS.walletAge, detail: `${ageDays} days old` },
      txHistory: { score: Math.round(txScore), weight: WEIGHTS.txHistory, detail: `${txCount} transactions` },
      balanceStability: { score: Math.round(balanceScore), weight: WEIGHTS.balanceStability, detail: `$${totalUSD.toFixed(2)} total` },
      lendingHistory: { score: Math.round(lendingScore), weight: WEIGHTS.lendingHistory, detail: aaveData.hasPositions ? 'Active Aave positions' : 'No lending history' },
      collateralRatio: { score: Math.round(collateralScore), weight: WEIGHTS.collateralRatio, detail: aaveData.healthFactor ? `HF: ${aaveData.healthFactor.toFixed(2)}` : 'No debt' }
    }

    const risk = score >= 70 ? 'low' : score >= 40 ? 'medium' : 'high'

    const recommendation = this._recommend(score, breakdown, aaveData)

    return {
      address,
      score,
      risk,
      breakdown,
      recommendation,
      maxLoanUSD: this._maxLoan(score, totalUSD, aaveData),
      suggestedAPR: this._suggestAPR(score),
      timestamp: new Date().toISOString()
    }
  }

  /** Get wallet creation age from first tx block */
  async _getWalletAge (address) {
    try {
      const currentBlock = await this.provider.getBlockNumber()
      const txCount = await this.provider.getTransactionCount(address)

      if (txCount === 0) return { days: 0, firstBlock: null }

      // Binary search for first transaction block (approximate)
      let lo = 0; let hi = currentBlock
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2)
        const count = await this.provider.getTransactionCount(address, mid)
        if (count > 0) hi = mid
        else lo = mid + 1
      }

      const firstBlock = await this.provider.getBlock(lo)
      const currentBlockData = await this.provider.getBlock(currentBlock)
      if (!firstBlock || !currentBlockData) return { days: 0, firstBlock: lo }

      const days = Math.floor((currentBlockData.timestamp - firstBlock.timestamp) / 86400)
      return { days, firstBlock: lo }
    } catch {
      return { days: 0, firstBlock: null }
    }
  }

  /** Get total transaction count */
  async _getTxCount (address) {
    try {
      return await this.provider.getTransactionCount(address)
    } catch {
      return 0
    }
  }

  /** Get token balances in USD */
  async _getTokenBalances (address) {
    let totalUSD = 0
    const balances = {}

    // ETH balance
    try {
      const ethBal = await this.provider.getBalance(address)
      const ethAmount = parseFloat(ethers.formatEther(ethBal))
      balances.ETH = ethAmount
      totalUSD += ethAmount * 2600 // approximate
    } catch { /* ignore */ }

    // ERC-20 balances
    const erc20Abi = ['function balanceOf(address) view returns (uint256)']
    for (const [symbol, token] of Object.entries(this.tokens)) {
      try {
        const contract = new ethers.Contract(token.address, erc20Abi, this.provider)
        const bal = await contract.balanceOf(address)
        const amount = parseFloat(ethers.formatUnits(bal, token.decimals))
        balances[symbol] = amount
        // Stablecoins ≈ $1, WETH ≈ ETH price
        const priceUSD = symbol === 'WETH' ? 2600 : 1
        totalUSD += amount * priceUSD
      } catch { /* ignore */ }
    }

    return { balances, totalUSD }
  }

  /** Get Aave position data */
  async _getAavePosition (address) {
    if (!this.poolAddress) return { hasPositions: false }

    try {
      const poolAbi = [
        'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)'
      ]
      const pool = new ethers.Contract(this.poolAddress, poolAbi, this.provider)
      const data = await pool.getUserAccountData(address)

      const collateralUSD = parseFloat(ethers.formatUnits(data.totalCollateralBase, 8))
      const debtUSD = parseFloat(ethers.formatUnits(data.totalDebtBase, 8))
      const healthFactor = parseFloat(ethers.formatUnits(data.healthFactor, 18))

      return {
        hasPositions: collateralUSD > 0 || debtUSD > 0,
        collateralUSD,
        debtUSD,
        healthFactor: debtUSD > 0 ? healthFactor : null,
        ltv: parseFloat(data.ltv.toString()) / 100
      }
    } catch {
      return { hasPositions: false }
    }
  }

  /** Score lending history (0-100) */
  _scoreLending (aaveData) {
    if (!aaveData.hasPositions) return 0
    let score = 30 // base: has positions

    if (aaveData.collateralUSD > 100) score += 20
    if (aaveData.collateralUSD > 500) score += 15
    if (aaveData.debtUSD > 0 && aaveData.healthFactor > 1.5) score += 20 // responsible borrower
    if (aaveData.debtUSD > 0 && aaveData.healthFactor > 2.0) score += 15 // very safe

    return Math.min(100, score)
  }

  /** Score collateral ratio (0-100) */
  _scoreCollateral (aaveData) {
    if (!aaveData.hasPositions) return 50 // neutral if no debt

    if (aaveData.debtUSD === 0) return 90 // lender only, no risk

    if (!aaveData.healthFactor) return 30

    // HF-based scoring
    if (aaveData.healthFactor >= 3.0) return 100
    if (aaveData.healthFactor >= 2.0) return 85
    if (aaveData.healthFactor >= 1.5) return 70
    if (aaveData.healthFactor >= 1.2) return 45
    return 15 // near liquidation
  }

  /** Generate recommendation text */
  _recommend (score, breakdown, aaveData) {
    if (score >= 80) return 'Excellent credit. Eligible for undercollateralized lending with competitive rates.'
    if (score >= 60) return 'Good credit. Standard collateral requirements apply. Consider building lending history for better rates.'
    if (score >= 40) return 'Fair credit. Higher collateral ratio required. Recommended: start with small, overcollateralized positions.'
    return 'Limited credit history. Fully collateralized lending only. Build on-chain history to improve score.'
  }

  /** Calculate max loan amount based on score */
  _maxLoan (score, totalUSD, aaveData) {
    const collateral = aaveData.collateralUSD || totalUSD
    if (score >= 80) return Math.round(collateral * 0.75) // 75% LTV
    if (score >= 60) return Math.round(collateral * 0.60) // 60% LTV
    if (score >= 40) return Math.round(collateral * 0.40) // 40% LTV
    return Math.round(collateral * 0.25) // 25% LTV
  }

  /** Suggest APR based on credit score */
  _suggestAPR (score) {
    if (score >= 80) return 3.5  // Prime rate
    if (score >= 60) return 5.0  // Standard
    if (score >= 40) return 8.0  // Subprime
    return 12.0                  // High risk
  }
}
