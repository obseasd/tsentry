// Tsentry — x402 Revenue Tracker
// Tracks payments received through x402 payment-gated endpoints

/**
 * In-memory revenue tracker for x402 micropayments
 * Records each successful payment with route, amount, timestamp, and payer info
 */
export class RevenueTracker {
  constructor () {
    this.payments = []
    this.totals = { count: 0, amountRaw: 0n }
    this.byRoute = {} // { 'GET /api/snapshot': { count, amountRaw } }
    this.decimals = 6 // USDT0 decimals
  }

  /**
   * Record a successful x402 payment
   * @param {object} info
   * @param {string} info.route - e.g. 'GET /api/snapshot'
   * @param {string} info.amount - Raw token amount string
   * @param {string} [info.payer] - Payer address
   * @param {string} [info.tx] - Transaction hash from facilitator
   */
  record (info) {
    const entry = {
      ts: new Date().toISOString(),
      route: info.route,
      amount: info.amount,
      amountUSD: Number(info.amount) / (10 ** this.decimals),
      payer: info.payer || 'unknown',
      tx: info.tx || null
    }

    this.payments.push(entry)
    if (this.payments.length > 10000) {
      this.payments = this.payments.slice(-5000)
    }

    // Update totals
    this.totals.count++
    this.totals.amountRaw += BigInt(info.amount || 0)

    // Update per-route totals
    if (!this.byRoute[info.route]) {
      this.byRoute[info.route] = { count: 0, amountRaw: 0n }
    }
    this.byRoute[info.route].count++
    this.byRoute[info.route].amountRaw += BigInt(info.amount || 0)

    return entry
  }

  /**
   * Get revenue summary
   */
  getSummary () {
    const routeStats = {}
    for (const [route, stats] of Object.entries(this.byRoute)) {
      routeStats[route] = {
        count: stats.count,
        totalUSD: Number(stats.amountRaw) / (10 ** this.decimals)
      }
    }

    return {
      totalPayments: this.totals.count,
      totalRevenueUSD: Number(this.totals.amountRaw) / (10 ** this.decimals),
      totalRevenueRaw: this.totals.amountRaw.toString(),
      byRoute: routeStats,
      recentPayments: this.payments.slice(-20)
    }
  }

  /**
   * Get revenue since a given timestamp
   * @param {string} since - ISO timestamp
   */
  getSince (since) {
    const sinceDate = new Date(since)
    const filtered = this.payments.filter(p => new Date(p.ts) >= sinceDate)
    const total = filtered.reduce((sum, p) => sum + p.amountUSD, 0)
    return {
      payments: filtered.length,
      revenueUSD: Math.round(total * 1e6) / 1e6,
      entries: filtered
    }
  }
}

/**
 * Express middleware that intercepts x402 paid requests and logs revenue
 * Must be placed AFTER the x402 paymentMiddleware
 *
 * @param {RevenueTracker} tracker
 * @param {object} x402Config - x402 middleware config (routes, pricing)
 * @returns {Function} Express middleware
 */
export function revenueMiddleware (tracker, x402Config) {
  // Build a set of gated routes for quick lookup
  const gatedRoutes = new Set(x402Config.routes || [])
  const pricing = x402Config.pricing || {}

  return (req, res, next) => {
    // Check if this request matches a gated route
    const routeKey = `${req.method} ${req.path}`
    if (!gatedRoutes.has(routeKey)) return next()

    // If we got past the x402 middleware, payment was accepted
    // The x402 middleware would have returned 402 if payment was missing
    // So reaching here means payment was verified

    // Extract payment info from x402 headers (set by t402 middleware)
    const paymentHeader = req.headers['x-payment'] || req.headers['x-402-payment']
    const payer = req.headers['x-payer'] || 'unknown'

    // Determine amount from route pricing
    const routePricing = Object.entries(pricing).find(([, v]) =>
      routeKey.toLowerCase().includes(v) || routeKey.includes(v)
    )

    // Map route to pricing key
    let amount = '0'
    if (routeKey.includes('snapshot')) amount = pricing.snapshot || '10000'
    else if (routeKey.includes('swap/execute')) amount = pricing.execute_swap || '100000'
    else if (routeKey.includes('bridge/execute')) amount = pricing.execute_bridge || '100000'
    else if (routeKey.includes('llm/reason')) amount = pricing.llm_reason || '50000'

    const entry = tracker.record({
      route: routeKey,
      amount,
      payer,
      tx: paymentHeader ? 'verified' : null
    })

    console.log(`[x402-revenue] +$${entry.amountUSD} from ${routeKey} (total: $${tracker.getSummary().totalRevenueUSD})`)
    next()
  }
}
