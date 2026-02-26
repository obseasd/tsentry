// Tsentry — Express Web Server
// Dashboard + API for monitoring the autonomous treasury agent

import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

// Static files
app.use(express.static(path.join(__dirname, '..', 'web', 'public')))
app.use(express.json())

// Simple template engine (plain HTML files)
app.set('views', path.join(__dirname, '..', 'web', 'views'))

// ─── Routes ───

app.get('/', (req, res) => {
  res.sendFile(path.join(app.get('views'), 'index.html'))
})

// API: Agent status
app.get('/api/status', (req, res) => {
  res.json({
    name: 'Tsentry',
    version: '0.1.0',
    status: 'idle',
    chains: ['ethereum'],
    protocols: {
      swap: ['velora'],
      bridge: ['usdt0'],
      lending: ['aave'],
      fiat: ['moonpay']
    },
    uptime: process.uptime()
  })
})

// API: Treasury overview (placeholder)
app.get('/api/treasury', (req, res) => {
  res.json({
    wallets: [],
    total_value_usd: 0,
    positions: [],
    pending_actions: []
  })
})

// API: Agent action log (placeholder)
app.get('/api/actions', (req, res) => {
  res.json({ actions: [] })
})

app.listen(PORT, () => {
  console.log(`[tsentry] Dashboard running at http://localhost:${PORT}`)
})
