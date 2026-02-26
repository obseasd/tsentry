// Tsentry — Treasury Agent Core
// Autonomous multi-chain treasury management logic

/**
 * TreasuryAgent — orchestrates wallet monitoring, rebalancing,
 * yield farming, and risk management through WDK MCP tools.
 */
export class TreasuryAgent {
  constructor () {
    /** @type {Map<string, object>} chain -> wallet state */
    this.wallets = new Map()

    /** @type {Array<object>} action history */
    this.actionLog = []

    /** @type {object|null} current strategy config */
    this.strategy = null

    /** @type {boolean} whether agent is actively managing */
    this.active = false
  }

  /**
   * Initialize agent with wallet data from MCP server
   * @param {object} mcpClient - MCP client connected to tsentry-wdk
   */
  async init (mcpClient) {
    this.mcp = mcpClient

    // Get wallet addresses for each chain
    const address = await this.callTool('get_address', { blockchain: 'ethereum' })
    this.wallets.set('ethereum', {
      address: address,
      balance: null,
      tokens: {},
      positions: { lending: [], swap: [] }
    })

    await this.refreshBalances()
    this.log('init', 'Agent initialized', { chains: [...this.wallets.keys()] })
  }

  /**
   * Call an MCP tool on the WDK server
   */
  async callTool (name, args = {}) {
    const result = await this.mcp.callTool({ name, arguments: args })
    return result.content?.[0]?.text ?? result
  }

  /**
   * Refresh all wallet balances
   */
  async refreshBalances () {
    for (const [chain, wallet] of this.wallets) {
      const balance = await this.callTool('get_balance', { blockchain: chain })
      wallet.balance = balance

      const usdtBalance = await this.callTool('get_token_balance', {
        blockchain: chain,
        token: 'USDT'
      })
      wallet.tokens.USDT = usdtBalance
    }
  }

  /**
   * Set the treasury strategy
   * @param {object} config - Strategy configuration
   * @param {number} config.targetYield - Target APY percentage
   * @param {number} config.maxRisk - Max risk tolerance (0-100)
   * @param {object} config.allocations - Target allocation percentages
   */
  setStrategy (config) {
    this.strategy = {
      targetYield: config.targetYield || 5,
      maxRisk: config.maxRisk || 30,
      allocations: config.allocations || {
        lending: 40,
        liquidity: 30,
        reserve: 30
      },
      rebalanceThreshold: config.rebalanceThreshold || 5
    }
    this.log('strategy', 'Strategy updated', this.strategy)
  }

  /**
   * Evaluate current positions and decide actions
   * @returns {Array<object>} proposed actions
   */
  async evaluate () {
    if (!this.strategy) return []

    const actions = []
    await this.refreshBalances()

    for (const [chain, wallet] of this.wallets) {
      const usdtBalance = parseFloat(wallet.tokens.USDT || '0')

      // Check if we have idle USDT that should be deployed
      if (usdtBalance > 10 && this.strategy.allocations.lending > 0) {
        const lendingAmount = usdtBalance * (this.strategy.allocations.lending / 100)

        // Quote lending supply
        const quote = await this.callTool('quote_supply', {
          blockchain: chain,
          protocol: 'aave',
          token: 'USDT',
          amount: lendingAmount.toString()
        })

        actions.push({
          type: 'lending_supply',
          chain,
          protocol: 'aave',
          token: 'USDT',
          amount: lendingAmount,
          quote,
          reason: `Deploy ${lendingAmount} USDT to Aave (${this.strategy.allocations.lending}% allocation)`
        })
      }

      // Check swap opportunities (price-based rebalancing)
      const price = await this.callTool('get_current_price', {
        symbol: 'ETHUSD'
      })

      if (price) {
        actions.push({
          type: 'price_check',
          chain,
          asset: 'ETH',
          price,
          reason: 'Monitor ETH price for swap triggers'
        })
      }
    }

    return actions
  }

  /**
   * Execute a proposed action
   * @param {object} action - Action from evaluate()
   * @returns {object} execution result
   */
  async execute (action) {
    this.log('execute_start', `Executing ${action.type}`, action)

    let result
    switch (action.type) {
      case 'lending_supply':
        result = await this.callTool('supply', {
          blockchain: action.chain,
          protocol: action.protocol,
          token: action.token,
          amount: action.amount.toString()
        })
        break

      case 'lending_withdraw':
        result = await this.callTool('withdraw', {
          blockchain: action.chain,
          protocol: action.protocol,
          token: action.token,
          amount: action.amount.toString()
        })
        break

      case 'swap':
        result = await this.callTool('swap', {
          blockchain: action.chain,
          protocol: action.protocol,
          fromToken: action.fromToken,
          toToken: action.toToken,
          amount: action.amount.toString()
        })
        break

      case 'bridge':
        result = await this.callTool('bridge', {
          blockchain: action.chain,
          protocol: action.protocol,
          token: action.token,
          amount: action.amount.toString(),
          targetChain: action.targetChain
        })
        break

      default:
        result = { skipped: true, reason: `Unknown action type: ${action.type}` }
    }

    this.log('execute_done', `Completed ${action.type}`, { action, result })
    return result
  }

  /**
   * Get current treasury snapshot
   */
  getSnapshot () {
    const walletData = {}
    for (const [chain, wallet] of this.wallets) {
      walletData[chain] = { ...wallet }
    }
    return {
      wallets: walletData,
      strategy: this.strategy,
      active: this.active,
      recentActions: this.actionLog.slice(-20)
    }
  }

  /**
   * Log an action
   */
  log (type, message, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      message,
      data
    }
    this.actionLog.push(entry)
    // Keep last 1000 entries
    if (this.actionLog.length > 1000) {
      this.actionLog = this.actionLog.slice(-500)
    }
  }
}
