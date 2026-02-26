// Tsentry — Express Web Server
// Dashboard + API backed by real TreasuryAgent

import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TreasuryAgent } from './agent/treasury.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

// ─── Agent Singleton ───
const agent = new TreasuryAgent()

// ─── Middleware ───
app.use(express.static(path.join(__dirname, '..', 'web', 'public')))
app.use(express.json())
app.set('views', path.join(__dirname, '..', 'web', 'views'))

// ─── Pages ───

app.get('/', (req, res) => {
  res.sendFile(path.join(app.get('views'), 'index.html'))
})

// ─── API: Read ───

app.get('/api/status', (req, res) => {
  const snap = agent.getSnapshot()
  res.json({
    name: 'Tsentry',
    version: '0.1.0',
    address: snap.address,
    active: snap.active,
    paused: snap.paused,
    cycle: snap.cycle,
    strategy: snap.strategy?.name || 'none',
    lendingPct: snap.lendingPct,
    uptime: process.uptime()
  })
})

app.get('/api/portfolio', (req, res) => {
  const snap = agent.getSnapshot()
  res.json({
    balances: snap.balances,
    supplied: snap.supplied,
    aaveAccount: snap.aaveAccount,
    portfolio: snap.portfolio,
    prices: snap.prices,
    lendingPct: snap.lendingPct
  })
})

app.get('/api/actions', (req, res) => {
  const snap = agent.getSnapshot()
  const limit = parseInt(req.query.limit) || 50
  res.json({
    actions: snap.recentActions.slice(-limit),
    errors: snap.recentErrors
  })
})

app.get('/api/snapshot', (req, res) => {
  res.json(agent.getSnapshot())
})

// ─── API: Control ───

app.post('/api/strategy', (req, res) => {
  try {
    const { name, config } = req.body
    agent.setStrategy(name || config)
    res.json({ ok: true, strategy: agent.strategy })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.post('/api/start', (req, res) => {
  const interval = req.body.intervalMs || 60_000
  agent.start(interval)
  res.json({ ok: true, active: true, intervalMs: interval })
})

app.post('/api/stop', (req, res) => {
  agent.stop()
  res.json({ ok: true, active: false })
})

app.post('/api/pause', (req, res) => {
  agent.paused ? agent.resume() : agent.pause()
  res.json({ ok: true, paused: agent.paused })
})

app.post('/api/cycle', async (req, res) => {
  try {
    await agent.cycle()
    res.json({ ok: true, snapshot: agent.getSnapshot() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/refresh', async (req, res) => {
  try {
    await agent.refresh()
    const snap = agent.getSnapshot()
    res.json({
      ok: true,
      balances: snap.balances,
      supplied: snap.supplied,
      portfolio: snap.portfolio
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── API: Direct Actions ───

app.post('/api/supply', async (req, res) => {
  try {
    const { token, amount } = req.body
    if (!token || !amount) return res.status(400).json({ error: 'token and amount required' })
    const result = await agent.aave.supply(token, parseFloat(amount))
    agent.log('manual_supply', `Manual supply ${amount} ${token}`, result)
    await agent.refresh()
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/withdraw', async (req, res) => {
  try {
    const { token, amount } = req.body
    if (!token) return res.status(400).json({ error: 'token required' })
    const amt = amount === 'max' ? Infinity : parseFloat(amount)
    const result = await agent.aave.withdraw(token, amt)
    agent.log('manual_withdraw', `Manual withdraw ${amount} ${token}`, result)
    await agent.refresh()
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── Boot ───

async function boot () {
  try {
    await agent.init()
    console.log(`[tsentry] Wallet: ${agent.wallet.address}`)
    console.log(`[tsentry] Balances:`, agent.balances)
    console.log(`[tsentry] Aave supplied:`, agent.supplied)

    // Default strategy
    agent.setStrategy('BALANCED')

    app.listen(PORT, () => {
      console.log(`[tsentry] Dashboard: http://localhost:${PORT}`)
    })
  } catch (e) {
    console.error('[tsentry] Boot failed:', e.message)
    process.exit(1)
  }
}

boot()
