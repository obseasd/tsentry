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

export const STRATEGIES = { CONSERVATIVE, BALANCED, AGGRESSIVE }
