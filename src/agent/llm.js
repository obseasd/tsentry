// Tsentry — LLM Reasoning Engine
// Uses Claude to analyze treasury state and propose intelligent actions

import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are Tsentry, an autonomous multi-chain treasury management agent.
Your job is to analyze the current treasury state and propose optimal actions.

You manage a USDT-focused portfolio across:
- Wallet holdings (ETH, USDT, DAI, USDC, WETH)
- Aave V3 lending positions (supply for yield)
- Velora DEX aggregator / Uniswap V3 swaps (rebalancing between tokens)
- USDT0 cross-chain bridge (LayerZero V2, 26+ chains)
- ERC-4337 Smart Account (gasless transactions via Safe)
- x402 payments (machine-to-machine USDT0 micropayments)

Tether ecosystem tokens (for awareness, not yet on-chain tradeable):
- USAt: Tether T-Bills — USD-denominated US Treasury yield token
- XAUt: Tether Gold — each token backed by 1 troy ounce of physical gold

Key principles:
1. USDT is the base currency — maximize USDT-denominated yield
2. Preserve capital first, optimize yield second
3. Keep enough ETH for gas (>0.002 ETH minimum)
4. Monitor health factor if any borrows exist (>1.5 safe, <1.2 critical)
5. Only propose actions with clear reasoning
6. Consider gas costs vs. benefit — don't rebalance $5 if gas costs $2

Strategy-specific behavior:
- "USDT Yield" strategy: aggressively consolidate DAI/USDC → USDT via swap, then supply USDT to Aave.
  Keep minimum $500 USDT in wallet as reserve. Supply order: USDT first, then USDC, DAI, WETH.
  Target 70% in Aave lending. This is the default Tether-centric strategy.
- "Conservative/Balanced/Aggressive": standard equal-weight stablecoin diversification.
- "Tether Diversified": spread across Tether ecosystem (USDT stablecoin + USAt T-Bills yield + XAUt gold hedge).
  60% lending, 15% real-world assets, 10% liquidity, 15% reserve.

You MUST respond with valid JSON matching this schema:
{
  "reasoning": "1-3 sentence analysis of current state",
  "answer": "Direct answer to user question (only if user instruction is a question, otherwise omit)",
  "market_assessment": "bullish | bearish | neutral | uncertain",
  "risk_level": "low | medium | high | critical",
  "actions": [
    {
      "type": "lending_supply | lending_withdraw | swap | bridge | alert | hold",
      "token": "TOKEN_SYMBOL",
      "tokenOut": "TOKEN_SYMBOL (for swaps)",
      "amount": 123.45,
      "reason": "why this action",
      "priority": "critical | high | medium | low",
      "confidence": 0.85
    }
  ],
  "next_check_suggestion": "30s | 1m | 5m | 15m | 1h"
}

IMPORTANT response rules:
- If the user asks a question (price, analysis, explanation), put the DIRECT ANSWER in the "answer" field and keep actions empty.
  Do NOT create alert actions to answer user questions — use the "answer" field instead.
- If no action is needed, return empty actions array with reasoning explaining why.
- Only propose executable actions (lending_supply, lending_withdraw, swap, bridge) when you genuinely recommend them.
- Never propose actions you're not confident about (confidence < 0.5).`

export class LlmReasoning {
  constructor (opts = {}) {
    this.apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY required — set in .env or pass apiKey option')
    }

    this.client = new Anthropic({ apiKey: this.apiKey })
    this.model = opts.model || 'claude-haiku-4-5-20251001'
    this.maxTokens = opts.maxTokens || 1024
    this.history = [] // conversation memory for context
    this.maxHistory = 10 // keep last N reasoning rounds
  }

  /**
   * Build a state summary for the LLM
   * @param {object} snapshot — agent.getSnapshot()
   * @param {object} opts — extra context
   * @returns {string} formatted state
   */
  buildStatePrompt (snapshot, opts = {}) {
    const lines = []

    lines.push('=== TREASURY STATE ===')
    lines.push(`Timestamp: ${new Date().toISOString()}`)
    lines.push(`Cycle: #${snapshot.cycle}`)
    lines.push(`Strategy: ${snapshot.strategy?.name || 'none'} (target lending: ${snapshot.strategy?.allocations?.lending || 0}%)`)
    lines.push(`Agent: ${snapshot.active ? 'ACTIVE' : 'STOPPED'} ${snapshot.paused ? '(PAUSED)' : ''}`)
    lines.push('')

    // Wallet balances
    lines.push('--- Wallet Balances ---')
    for (const [sym, bal] of Object.entries(snapshot.balances || {})) {
      if (bal > 0) {
        const usdVal = sym === 'ETH' || sym === 'WETH'
          ? `(~$${(bal * (snapshot.prices?.ETH?.usd || 2600)).toFixed(2)})`
          : `(~$${bal.toFixed(2)})`
        lines.push(`  ${sym}: ${bal} ${usdVal}`)
      }
    }

    // Supplied (Aave)
    lines.push('')
    lines.push('--- Aave Supplied ---')
    const hasSupplied = Object.values(snapshot.supplied || {}).some(v => v > 0)
    if (hasSupplied) {
      for (const [sym, amt] of Object.entries(snapshot.supplied)) {
        if (amt > 0) lines.push(`  ${sym}: ${amt}`)
      }
    } else {
      lines.push('  (none)')
    }

    // Aave account
    if (snapshot.aaveAccount) {
      const a = snapshot.aaveAccount
      lines.push('')
      lines.push('--- Aave Account ---')
      lines.push(`  Total Collateral: $${a.totalCollateralUSD?.toFixed(2) || '0'}`)
      lines.push(`  Total Debt: $${a.totalDebtUSD?.toFixed(2) || '0'}`)
      lines.push(`  Available Borrow: $${a.availableBorrowUSD?.toFixed(2) || '0'}`)
      if (a.healthFactor) lines.push(`  Health Factor: ${a.healthFactor}`)
    }

    // Portfolio
    lines.push('')
    lines.push('--- Portfolio ---')
    lines.push(`  Lending Allocation: ${snapshot.lendingPct}%`)
    if (snapshot.portfolio) {
      lines.push(`  Total Value: $${snapshot.portfolio.totalUSD?.toFixed(2) || '?'}`)
    }

    // Prices
    lines.push('')
    lines.push('--- Market Prices ---')
    for (const [sym, data] of Object.entries(snapshot.prices || {})) {
      if (data?.usd) {
        const change = data.usd_24h_change
        const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→'
        lines.push(`  ${sym}: $${data.usd} ${arrow}${Math.abs(change || 0).toFixed(1)}% (24h)`)
      }
    }

    // Available swap pairs
    if (snapshot.swapPairs?.length > 0) {
      lines.push('')
      lines.push('--- Available Swaps ---')
      lines.push(`  ${snapshot.swapPairs.map(p => `${p.tokenA}/${p.tokenB}`).join(', ')}`)
    }

    // Bridge routes
    if (snapshot.bridgeChains?.length > 0) {
      lines.push('')
      lines.push('--- Bridge Routes (USDT0) ---')
      lines.push(`  Chains: ${snapshot.bridgeChains.map(c => c.name).join(', ')}`)
    }

    // Recent actions for context
    const recentActions = (snapshot.recentActions || []).slice(-5)
    if (recentActions.length > 0) {
      lines.push('')
      lines.push('--- Recent Actions (last 5) ---')
      for (const a of recentActions) {
        lines.push(`  [${a.type}] ${a.message} (${a.ts})`)
      }
    }

    // Recent errors
    if (snapshot.recentErrors?.length > 0) {
      lines.push('')
      lines.push('--- Recent Errors ---')
      for (const e of snapshot.recentErrors.slice(-3)) {
        lines.push(`  [${e.context}] ${e.message} (${e.ts})`)
      }
    }

    // Strategy constraints
    if (snapshot.strategy) {
      lines.push('')
      lines.push('--- Strategy Constraints ---')
      lines.push(`  Target Yield: ${snapshot.strategy.targetYield}%`)
      lines.push(`  Max Risk: ${snapshot.strategy.maxRisk}`)
      lines.push(`  Allocations: lending=${snapshot.strategy.allocations.lending}%, liquidity=${snapshot.strategy.allocations.liquidity}%, reserve=${snapshot.strategy.allocations.reserve}%`)
      lines.push(`  Rebalance Threshold: ${snapshot.strategy.rebalanceThreshold}%`)
    }

    // Extra context (e.g. user instructions)
    if (opts.userInstruction) {
      lines.push('')
      lines.push(`--- User Instruction ---`)
      lines.push(`  ${opts.userInstruction}`)
    }

    return lines.join('\n')
  }

  /**
   * Run LLM reasoning on current state
   * @param {object} snapshot — from agent.getSnapshot()
   * @param {object} opts — { userInstruction?, ruleBasedActions? }
   * @returns {object} parsed LLM decision
   */
  async reason (snapshot, opts = {}) {
    const statePrompt = this.buildStatePrompt(snapshot, opts)

    // Include rule-based actions as advisory
    let userMessage = statePrompt
    if (opts.ruleBasedActions?.length > 0) {
      userMessage += '\n\n--- Rule-Based Suggestions (for reference) ---'
      for (const a of opts.ruleBasedActions) {
        userMessage += `\n  [${a.type}] ${a.reason} (priority: ${a.priority})`
      }
      userMessage += '\n\nConsider these rule-based suggestions but use your own judgment. You may agree, modify, or override them.'
    }

    if (opts.userInstruction) {
      userMessage += `\n\nThe user is asking: "${opts.userInstruction}". Answer their question directly in the "answer" field. Return empty actions array — do NOT create alert actions to answer questions.`
    } else {
      userMessage += '\n\nAnalyze the treasury state and propose actions.'
    }
    userMessage += ' Respond with JSON only.'

    // Build messages with history for continuity
    const messages = [
      ...this.history,
      { role: 'user', content: userMessage }
    ]

    const startTime = Date.now()

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: SYSTEM_PROMPT,
      messages
    })

    const elapsed = Date.now() - startTime
    const text = response.content[0]?.text || ''

    // Parse JSON from response (handle markdown code blocks)
    let decision
    try {
      const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      decision = JSON.parse(jsonStr)
    } catch (parseErr) {
      // Try extracting JSON from within the text
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        decision = JSON.parse(match[0])
      } else {
        throw new Error(`LLM returned invalid JSON: ${text.slice(0, 200)}`)
      }
    }

    // Validate structure
    if (!decision.reasoning || !Array.isArray(decision.actions)) {
      throw new Error(`LLM response missing required fields: ${JSON.stringify(decision).slice(0, 200)}`)
    }

    // Filter low-confidence actions
    decision.actions = decision.actions.filter(a => (a.confidence || 0) >= 0.5)

    // Post-process for user questions: extract answer, strip alert-as-answer actions
    if (opts.userInstruction) {
      // If LLM didn't provide answer field, synthesize from reasoning
      if (!decision.answer) {
        decision.answer = decision.reasoning
      }
      // Remove alert/hold actions that are just answering the question (not real alerts)
      decision.actions = decision.actions.filter(a =>
        a.type !== 'alert' && a.type !== 'hold'
      )
    }

    // Add metadata
    decision._meta = {
      model: this.model,
      latencyMs: elapsed,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      timestamp: new Date().toISOString()
    }

    // Update conversation history
    this.history.push(
      { role: 'user', content: `[Cycle #${snapshot.cycle}] ${statePrompt.slice(0, 500)}...` },
      { role: 'assistant', content: text }
    )
    // Trim history
    if (this.history.length > this.maxHistory * 2) {
      this.history = this.history.slice(-this.maxHistory * 2)
    }

    return decision
  }

  /**
   * Quick health check — is the LLM reachable?
   */
  async healthCheck () {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 32,
        messages: [{ role: 'user', content: 'Reply with just: {"status":"ok"}' }]
      })
      const text = response.content[0]?.text || ''
      return text.includes('ok')
    } catch (e) {
      return false
    }
  }

  /**
   * Parse a natural language rule into structured conditions + actions
   * @param {string} text — e.g. "put 60% in highest APR protocol, if APR drops 5% withdraw all and send USDT to 0x..."
   * @param {object} snapshot — current agent state for context
   * @returns {object} { description, conditions, actions, oneShot }
   */
  async parseRule (text, snapshot = {}) {
    const prompt = `You are a DeFi rule parser. Convert the user's natural language instruction into a structured conditional rule for an autonomous treasury agent.

Current agent state:
- Wallet balances: ${JSON.stringify(snapshot.balances || {})}
- Aave supplied: ${JSON.stringify(snapshot.supplied || {})}
- Strategy: ${snapshot.strategy?.name || 'none'}
- Lending %: ${snapshot.lendingPct || '0'}%

Available condition types:
- apr_below: { type: "apr_below", value: <number> } — Aave APY falls below X%
- apr_drop_pct: { type: "apr_drop_pct", value: <number> } — APR dropped by X% relative to when rule was created
- balance_below: { type: "balance_below", token: "SYMBOL", value: <number> }
- balance_above: { type: "balance_above", token: "SYMBOL", value: <number> }
- price_below: { type: "price_below", token: "SYMBOL", value: <number> }
- price_above: { type: "price_above", token: "SYMBOL", value: <number> }
- price_drop_pct: { type: "price_drop_pct", token: "SYMBOL", value: <number> }
- health_factor_below: { type: "health_factor_below", value: <number> }
- lending_pct_above: { type: "lending_pct_above", value: <number> }
- lending_pct_below: { type: "lending_pct_below", value: <number> }

Available action types:
- lending_supply: { type: "lending_supply", token: "SYMBOL", amount: <number|"max"> }
- lending_withdraw: { type: "lending_withdraw", token: "SYMBOL", amount: <number|"max"> }
- swap: { type: "swap", tokenIn: "SYMBOL", tokenOut: "SYMBOL", amount: <number|"max"> }
- bridge: { type: "bridge", targetChain: "chain_name", amount: <number> }
- transfer: { type: "transfer", token: "SYMBOL", to: "0xADDRESS", amount: <number|"max"> }
- alert: { type: "alert", level: "warning|critical", reason: "message" }

Respond with JSON only:
{
  "description": "Short human-readable summary of the rule",
  "conditions": [ ... ],
  "actions": [ ... ],
  "oneShot": true/false,
  "confidence": 0.0-1.0
}

Rules:
- If the user says "if X then Y", X becomes conditions and Y becomes actions
- "withdraw all" = amount: "max"
- "send to address" = transfer action
- For allocation instructions like "put 60% of 100 USDT in lending", calculate the amount (60)
- oneShot=true if it's a one-time action, false if it should keep monitoring
- If the instruction implies ongoing monitoring (e.g. "if APR drops"), set oneShot=false
- Tokens: ETH, WETH, USDT, USDC, DAI, USDT0`

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        { role: 'user', content: `${prompt}\n\nUser instruction: "${text}"\n\nRespond with JSON only.` }
      ]
    })

    const raw = response.content[0]?.text || ''
    const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) parsed = JSON.parse(match[0])
      else throw new Error(`Failed to parse rule: ${raw.slice(0, 200)}`)
    }

    if (!parsed.conditions || !parsed.actions) {
      throw new Error('Rule must have conditions and actions')
    }

    return parsed
  }

  /** Reset conversation history */
  resetHistory () {
    this.history = []
  }
}
