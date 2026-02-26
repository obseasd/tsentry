// Tsentry — Treasury Agent Core
// Autonomous EVM treasury management with real on-chain execution

import { createWalletFromEnv } from '../evm/wallet.js'
import { AaveLending } from '../evm/aave.js'
import { calculatePortfolioValue, getPrices } from '../evm/pricing.js'
import { STRATEGIES } from './strategies.js'

/**
 * TreasuryAgent — full autonomous loop:
 *   refresh → evaluate → propose → execute → log → sleep → repeat
 */
export class TreasuryAgent {
  constructor () {
    this.wallet = null
    this.aave = null
    this.strategy = null
    this.active = false
    this.paused = false

    // State
    this.balances = {}
    this.supplied = {}
    this.aaveAccount = null
    this.portfolio = null
    this.prices = {}

    // Logging
    this.actionLog = []
    this.errors = []

    // Loop config
    this.pollIntervalMs = 60_000 // 1 min
    this._timer = null
    this._cycleCount = 0
  }

  /** Initialize with real wallet + Aave connection */
  async init () {
    this.wallet = createWalletFromEnv()

    this.aave = new AaveLending({
      signer: this.wallet.signer,
      poolAddress: process.env.AAVE_POOL,
      tokens: this.wallet.tokens
    })

    await this.refresh()
    this.log('init', `Agent initialized — wallet ${this.wallet.address}`, {
      balances: this.balances,
      supplied: this.supplied
    })

    return this
  }

  /** Refresh all on-chain data */
  async refresh () {
    try {
      // Wallet balances
      this.balances = await this.wallet.getAllBalances()

      // Aave positions
      this.supplied = await this.aave.getAllSupplied()
      this.aaveAccount = await this.aave.getAccountData()

      // Live prices
      this.prices = await getPrices(['ETH', 'BTC', 'USDT', 'DAI', 'USDC'])

      // Portfolio value (wallet + supplied)
      const combined = { ...this.balances }
      for (const [sym, amt] of Object.entries(this.supplied)) {
        combined[`a${sym}`] = amt // aUSDT, aDAI, etc.
      }
      this.portfolio = await calculatePortfolioValue(combined)
    } catch (e) {
      this.logError('refresh', e)
    }
  }

  /** Set strategy by name or config */
  setStrategy (nameOrConfig) {
    if (typeof nameOrConfig === 'string') {
      const strat = STRATEGIES[nameOrConfig.toUpperCase()]
      if (!strat) throw new Error(`Unknown strategy: ${nameOrConfig}`)
      this.strategy = { ...strat }
    } else {
      this.strategy = { ...nameOrConfig }
    }
    this.log('strategy', `Strategy set: ${this.strategy.name}`, this.strategy)
  }

  /**
   * Evaluate current state and generate proposed actions
   * @returns {Array<object>} actions
   */
  async evaluate () {
    if (!this.strategy) return []
    const actions = []

    // Compute total portfolio value in USD terms
    const ethPrice = this.prices?.ETH?.usd || 2600
    const walletUSD = (this.balances.USDT || 0) + (this.balances.DAI || 0) +
      (this.balances.USDC || 0) + (this.balances.WETH || 0) * ethPrice +
      (this.balances.ETH || 0) * ethPrice
    const suppliedUSD = (this.supplied.USDT || 0) + (this.supplied.DAI || 0) +
      (this.supplied.USDC || 0) + (this.supplied.WETH || 0) * ethPrice
    const totalUSD = walletUSD + suppliedUSD

    if (totalUSD < 1) return []

    const currentLendingPct = (suppliedUSD / totalUSD) * 100
    const targetLendingPct = this.strategy.allocations.lending
    const drift = targetLendingPct - currentLendingPct

    // Rebalance lending if drift exceeds threshold
    if (Math.abs(drift) > this.strategy.rebalanceThreshold) {
      const targetDeltaUSD = (drift / 100) * totalUSD

      if (drift > 0) {
        // Need to supply more
        // Prioritize: WETH (no supply cap on Sepolia), then stablecoins
        const capped = this._supplyCapped || new Set()
        const supplyable = [
          { token: 'WETH', bal: this.balances.WETH || 0, valuePerUnit: ethPrice, minKeep: 0.001 },
          { token: 'USDT', bal: this.balances.USDT || 0, valuePerUnit: 1, minKeep: 10 },
          { token: 'DAI', bal: this.balances.DAI || 0, valuePerUnit: 1, minKeep: 10 },
          { token: 'USDC', bal: this.balances.USDC || 0, valuePerUnit: 1, minKeep: 10 }
        ].filter(s => s.bal > s.minKeep && !capped.has(s.token))

        let remainingUSD = Math.abs(targetDeltaUSD)
        for (const s of supplyable) {
          if (remainingUSD <= 0) break
          const availableUSD = (s.bal - s.minKeep) * s.valuePerUnit * 0.95
          const useUSD = Math.min(availableUSD, remainingUSD)
          const useUnits = useUSD / s.valuePerUnit
          if (useUnits < (s.token === 'WETH' ? 0.0001 : 1)) continue

          // Round appropriately
          const amount = s.token === 'WETH'
            ? Math.floor(useUnits * 1e6) / 1e6
            : Math.floor(useUnits * 100) / 100

          actions.push({
            type: 'lending_supply',
            token: s.token,
            amount,
            reason: `Lending at ${currentLendingPct.toFixed(1)}%, target ${targetLendingPct}% — supply ${amount} ${s.token} (~$${useUSD.toFixed(0)})`,
            priority: 'medium'
          })
          remainingUSD -= useUSD
        }
      } else {
        // Need to withdraw — from supplied positions
        const withdrawable = Object.entries(this.supplied)
          .filter(([, v]) => v > 0.0001)
          .map(([token, bal]) => ({
            token, bal,
            valuePerUnit: token === 'WETH' ? ethPrice : 1
          }))
          .sort((a, b) => (b.bal * b.valuePerUnit) - (a.bal * a.valuePerUnit))

        let remainingUSD = Math.abs(targetDeltaUSD)
        for (const s of withdrawable) {
          if (remainingUSD <= 0) break
          const useUSD = Math.min(s.bal * s.valuePerUnit, remainingUSD)
          const useUnits = useUSD / s.valuePerUnit
          const amount = s.token === 'WETH'
            ? Math.floor(useUnits * 1e6) / 1e6
            : Math.floor(useUnits * 100) / 100

          actions.push({
            type: 'lending_withdraw',
            token: s.token,
            amount,
            reason: `Lending at ${currentLendingPct.toFixed(1)}%, target ${targetLendingPct}% — withdraw ${amount} ${s.token}`,
            priority: 'medium'
          })
          remainingUSD -= useUSD
        }
      }
    }

    // Health factor monitoring (if we have borrows)
    if (this.aaveAccount && this.aaveAccount.totalDebtUSD > 0) {
      if (this.aaveAccount.healthFactor < 1.5) {
        actions.push({
          type: 'alert',
          level: 'critical',
          reason: `Health factor LOW: ${this.aaveAccount.healthFactor.toFixed(2)} — repay debt or add collateral`,
          priority: 'critical'
        })
      }
    }

    // Gas check
    if (this.balances.ETH < 0.002) {
      actions.push({
        type: 'alert',
        level: 'warning',
        reason: `Low ETH for gas: ${this.balances.ETH.toFixed(6)} ETH`,
        priority: 'high'
      })
    }

    return actions
  }

  /** Pick stablecoin with highest wallet balance */
  _pickBestStable () {
    let best = null
    let max = 0
    for (const sym of ['USDT', 'DAI', 'USDC']) {
      if ((this.balances[sym] || 0) > max) {
        max = this.balances[sym]
        best = sym
      }
    }
    return best
  }

  /** Pick supplied token with highest balance */
  _pickBestSupplied () {
    let best = null
    let max = 0
    for (const [sym, amt] of Object.entries(this.supplied)) {
      if (amt > max) { max = amt; best = sym }
    }
    return best
  }

  /**
   * Execute an action on-chain
   * @param {object} action
   * @returns {object} result
   */
  async execute (action) {
    this.log('execute', `Executing ${action.type}: ${action.reason}`, action)

    try {
      let result
      switch (action.type) {
        case 'lending_supply':
          // If supplying WETH but balance is low, wrap ETH first
          if (action.token === 'WETH') {
            const wethBal = this.balances.WETH || 0
            if (wethBal < action.amount) {
              const toWrap = action.amount - wethBal + 0.0001
              const ethAvail = this.balances.ETH - 0.002
              if (ethAvail >= toWrap) {
                this.log('wrap', `Wrapping ${toWrap.toFixed(6)} ETH → WETH`)
                await this.wallet.wrapEth(toWrap)
              }
            }
          }
          try {
            result = await this.aave.supply(action.token, action.amount)
          } catch (supplyErr) {
            // Aave error "51" = SUPPLY_CAP_EXCEEDED — add to blocked list
            if (supplyErr.message?.includes('"51"')) {
              this._supplyCapped = this._supplyCapped || new Set()
              this._supplyCapped.add(action.token)
              this.log('cap', `Supply cap exceeded for ${action.token} — skipping future supplies`)
              result = { skipped: true, reason: `Supply cap exceeded for ${action.token}` }
            } else {
              throw supplyErr
            }
          }
          break

        case 'lending_withdraw':
          result = await this.aave.withdraw(action.token, action.amount)
          break

        case 'alert':
          result = { acknowledged: true }
          break

        default:
          result = { skipped: true, reason: `Unhandled action type: ${action.type}` }
      }

      this.log('execute_done', `Completed ${action.type}`, {
        tx: result.tx,
        gasUsed: result.gasUsed
      })
      return result
    } catch (e) {
      this.logError('execute', e, action)
      return { error: e.message }
    }
  }

  /**
   * Run a single agent cycle: refresh → evaluate → execute
   */
  async cycle () {
    this._cycleCount++
    const cycleId = this._cycleCount

    try {
      await this.refresh()

      const actions = await this.evaluate()

      if (actions.length > 0) {
        this.log('cycle', `Cycle #${cycleId}: ${actions.length} action(s) proposed`, {
          actions: actions.map(a => ({ type: a.type, reason: a.reason }))
        })

        for (const action of actions) {
          if (action.type === 'alert') {
            this.log('alert', action.reason, { level: action.level })
            continue
          }
          if (!this.paused) {
            await this.execute(action)
          } else {
            this.log('skip', `Paused — skipping ${action.type}`, action)
          }
        }
      } else {
        this.log('cycle', `Cycle #${cycleId}: no actions needed`, {
          balances: this.balances,
          supplied: this.supplied,
          lendingPct: this._currentLendingPct()
        })
      }
    } catch (e) {
      this.logError('cycle', e)
    }
  }

  _currentLendingPct () {
    const ethPrice = this.prices?.ETH?.usd || 2600
    const suppliedUSD = (this.supplied.USDT || 0) + (this.supplied.DAI || 0) +
      (this.supplied.USDC || 0) + (this.supplied.WETH || 0) * ethPrice
    const walletUSD = (this.balances.USDT || 0) + (this.balances.DAI || 0) +
      (this.balances.USDC || 0) + (this.balances.WETH || 0) * ethPrice +
      (this.balances.ETH || 0) * ethPrice
    const total = walletUSD + suppliedUSD
    return total > 0 ? ((suppliedUSD / total) * 100).toFixed(1) : '0.0'
  }

  /** Start the autonomous loop */
  start (intervalMs) {
    if (intervalMs) this.pollIntervalMs = intervalMs
    this.active = true
    this.paused = false
    this.log('start', `Agent loop started (interval: ${this.pollIntervalMs / 1000}s)`)
    this._scheduleNext()
  }

  /** Stop the autonomous loop */
  stop () {
    this.active = false
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    this.log('stop', 'Agent loop stopped')
  }

  /** Pause execution (still evaluates but doesn't execute) */
  pause () {
    this.paused = true
    this.log('pause', 'Agent paused — will evaluate but not execute')
  }

  /** Resume execution */
  resume () {
    this.paused = false
    this.log('resume', 'Agent resumed')
  }

  _scheduleNext () {
    if (!this.active) return
    this._timer = setTimeout(async () => {
      await this.cycle()
      this._scheduleNext()
    }, this.pollIntervalMs)
  }

  /** Get full snapshot for API/dashboard */
  getSnapshot () {
    return {
      address: this.wallet?.address,
      active: this.active,
      paused: this.paused,
      cycle: this._cycleCount,
      strategy: this.strategy,
      balances: this.balances,
      supplied: this.supplied,
      aaveAccount: this.aaveAccount,
      portfolio: this.portfolio,
      prices: this.prices,
      lendingPct: this._currentLendingPct(),
      recentActions: this.actionLog.slice(-50),
      recentErrors: this.errors.slice(-10)
    }
  }

  /** Log an event */
  log (type, message, data = {}) {
    const entry = { ts: new Date().toISOString(), type, message, data }
    this.actionLog.push(entry)
    if (this.actionLog.length > 2000) {
      this.actionLog = this.actionLog.slice(-1000)
    }
    console.log(`[tsentry] [${type}] ${message}`)
  }

  logError (context, error, extra = {}) {
    const entry = {
      ts: new Date().toISOString(),
      context,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      extra
    }
    this.errors.push(entry)
    if (this.errors.length > 100) {
      this.errors = this.errors.slice(-50)
    }
    console.error(`[tsentry] [ERROR:${context}] ${error.message}`)
  }
}
