// Tsentry — Pre-built Treasury Strategies

/**
 * Conservative: prioritize capital preservation, low risk
 * - 60% in lending (Aave) for stable yield
 * - 10% in liquidity (swap-ready)
 * - 30% reserve (untouched)
 */
export const CONSERVATIVE = {
  name: 'Conservative',
  targetYield: 3,
  maxRisk: 15,
  allocations: {
    lending: 60,
    liquidity: 10,
    reserve: 30
  },
  rebalanceThreshold: 10
}

/**
 * Balanced: moderate risk for better yield
 * - 40% lending
 * - 30% liquidity provision
 * - 30% reserve
 */
export const BALANCED = {
  name: 'Balanced',
  targetYield: 6,
  maxRisk: 40,
  allocations: {
    lending: 40,
    liquidity: 30,
    reserve: 30
  },
  rebalanceThreshold: 5
}

/**
 * Aggressive: maximize yield, higher risk tolerance
 * - 50% lending
 * - 40% liquidity
 * - 10% reserve
 */
export const AGGRESSIVE = {
  name: 'Aggressive',
  targetYield: 12,
  maxRisk: 70,
  allocations: {
    lending: 50,
    liquidity: 40,
    reserve: 10
  },
  rebalanceThreshold: 3
}

/**
 * USDT Yield: Tether-centric — maximize USDT yield via Aave lending
 * - 70% lending (prioritize USDT supply on Aave)
 * - 10% liquidity (swap-ready for rebalancing)
 * - 20% reserve (USDT in wallet for bridging/payments)
 * - Consolidates DAI/USDC into USDT via swap when overweight
 * - Aggressively supplies USDT to Aave for yield
 */
export const USDT_YIELD = {
  name: 'USDT Yield',
  targetYield: 8,
  maxRisk: 30,
  allocations: {
    lending: 70,
    liquidity: 10,
    reserve: 20
  },
  rebalanceThreshold: 5,
  // USDT-centric preferences
  baseCurrency: 'USDT',
  consolidateToBase: true,       // swap DAI/USDC → USDT when overweight
  consolidateThreshold: 0.30,    // consolidate if non-USDT stables > 30% of total stables
  lendingPriority: ['USDT', 'USDC', 'DAI', 'WETH'],  // supply order preference
  minUsdtReserve: 500            // always keep >= $500 USDT in wallet
}

/**
 * Tether Diversified: spread across Tether ecosystem tokens
 * - USDT (stablecoin) + USAt (T-Bills yield) + XAUt (gold hedge)
 * - 60% lending (USDT/stablecoins via Aave)
 * - 15% real-world assets (USAt for T-Bills yield, XAUt for gold exposure)
 * - 10% liquidity
 * - 15% reserve
 */
export const TETHER_DIVERSIFIED = {
  name: 'Tether Diversified',
  targetYield: 6,
  maxRisk: 25,
  allocations: {
    lending: 60,
    liquidity: 10,
    reserve: 15,
    rwa: 15  // real-world assets (USAt/XAUt)
  },
  rebalanceThreshold: 5,
  baseCurrency: 'USDT',
  consolidateToBase: false,
  lendingPriority: ['USDT', 'USDC', 'DAI', 'WETH'],
  // Tether ecosystem token awareness
  tetherTokens: {
    USAt: { type: 'tbills', description: 'Tether T-Bills — USD-denominated US Treasury yield' },
    XAUt: { type: 'gold', description: 'Tether Gold — 1 troy ounce gold per token' }
  }
}

export const STRATEGIES = { CONSERVATIVE, BALANCED, AGGRESSIVE, USDT_YIELD, TETHER_DIVERSIFIED }
