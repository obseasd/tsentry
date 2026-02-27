# Tsentry

**Autonomous Multi-Chain Treasury Agent** powered by [Tether WDK](https://github.com/nickinopen-claw/wdk) and [OpenClaw](https://github.com/nickinopen-claw/openclaw).

Tsentry is an AI-powered treasury agent that autonomously manages digital asset portfolios: monitoring positions, rebalancing allocations, lending for yield, swapping tokens, and bridging cross-chain — all through a single seed phrase via the Tether Wallet Development Kit.

> Built for **Tether Hackathon Galactica: WDK Edition 1**

## How It Works

```
Seed Phrase (WDK_SEED)
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Tether WDK                                                 │
│  BIP-39 → BIP-44 derivation → EVM wallet                   │
│  + Aave Lending + Velora Swap + USDT0 Bridge + MoonPay Fiat │
└────────────────────────┬────────────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
     ┌──────▼──────┐          ┌───────▼──────┐
     │  Dashboard   │          │  MCP Server  │
     │  (Express)   │          │  (OpenClaw)  │
     │  Port 3000   │          │  stdio       │
     └──────┬───────┘          └───────┬──────┘
            │                          │
     ┌──────▼──────────────────────────▼──────┐
     │         TreasuryAgent Core             │
     │  refresh → evaluate → propose → execute │
     │                                         │
     │  ┌────────────┐  ┌───────────────────┐ │
     │  │ LLM Engine │  │ Rule-Based Safety │ │
     │  │  (Claude)  │◄─│   (deterministic) │ │
     │  └────────────┘  └───────────────────┘ │
     │                                         │
     │  ┌────────┬──────────┬────────┬───────┐ │
     │  │ Aave   │ Uniswap  │ USDT0  │Wallet │ │
     │  │Lending │  Swap    │ Bridge │ Ops   │ │
     │  └────────┴──────────┴────────┴───────┘ │
     └─────────────────────────────────────────┘
```

## Features

### Wallet (WDK-Native)
- **BIP-39 seed** → deterministic wallet via `@tetherto/wdk-wallet-evm`
- Derived ethers.js signer for DeFi contract compatibility
- ETH + ERC20 balances, transfers, wrap/unwrap WETH
- Address verification (WDK ↔ ethers.js match)

### Autonomous Agent
- **Continuous loop**: refresh on-chain state → evaluate → propose actions → execute → sleep → repeat
- **LLM reasoning** (Claude Haiku 4.5): analyzes portfolio state, market conditions, proposes intelligent actions with confidence scores
- **Rule-based safety net**: deterministic rules always run alongside LLM — critical alerts propagate regardless of AI output
- **Adaptive polling**: LLM suggests optimal check intervals (30s → 1h) based on market volatility
- **4 strategies**: Conservative, Balanced, Aggressive, USDT Yield (default)

### DeFi Protocols
- **Aave V3 Lending** — supply/withdraw/borrow with health factor monitoring, supply cap detection
- **Uniswap V3 Swaps** — quote + execute across 6 token pairs, 3 fee tiers (0.05%/0.3%/1%)
- **USDT0 Bridge** — LayerZero V2 cross-chain bridging (Ethereum, Arbitrum, Berachain, Ink)
- **MoonPay** — fiat on/off-ramp integration via WDK

### USDT Yield Strategy
The default Tether-centric strategy:
- 70% deployed to Aave lending (USDT priority)
- Consolidates DAI/USDC → USDT when non-USDT stablecoins exceed 30%
- Maintains $500 USDT wallet reserve
- Supply priority: USDT → USDC → DAI → WETH

### MCP Server (42 Tools)
Full Model Context Protocol server for AI agent interoperability via OpenClaw:

| Category | Tools | Count |
|----------|-------|-------|
| Wallet | get_address, get_balance, transfer, sign, verify | ~8 |
| Swap | quote_swap, swap (Velora) | ~5 |
| Bridge | quote_bridge, bridge (USDT0) | ~4 |
| Lending | quote_supply, supply, quote_withdraw, withdraw, borrow | ~8 |
| Pricing | get_current_price, get_historical_price | ~4 |
| Fiat | quote_buy, buy, quote_sell, sell (MoonPay) | ~4 |
| **Tsentry Custom** | portfolio, overview, swap_quote, swap_execute, bridge_quote, bridge_routes, supply, withdraw, **ask_ai** | **9** |

### Dashboard
- Real-time portfolio overview (wallet + Aave positions)
- Dracula-themed UI with live price feeds
- Agent controls: start/stop/pause, strategy picker, manual cycle
- Supply/withdraw directly from UI
- Swap quotes + execution
- Bridge route comparison
- AI Reasoning panel: toggle LLM, view latest analysis, Ask AI input
- Action log with timestamps
- WDK wallet badge

## Quick Start

```bash
# Clone
git clone https://github.com/obseasd/tsentry.git
cd tsentry

# Install
npm install

# Configure
cp .env.example .env
# Edit .env — add your WDK_SEED (12-word mnemonic)
# Optional: ANTHROPIC_API_KEY for AI reasoning

# Start dashboard
npm run dev
# → http://localhost:3000

# Or start MCP server (for OpenClaw / AI agents)
npm run mcp
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WDK_SEED` | Yes | 12-word BIP-39 mnemonic for WDK wallet |
| `ETH_RPC_URL` | No | RPC endpoint (default: Sepolia via drpc.org) |
| `ETH_PRIVATE_KEY` | No | Fallback if WDK_SEED not set |
| `ANTHROPIC_API_KEY` | No | Enables AI reasoning (Claude Haiku 4.5) |
| `USDT_CONTRACT` | No | Sepolia USDT address (default included) |
| `DAI_CONTRACT` | No | Sepolia DAI address (default included) |
| `USDC_CONTRACT` | No | Sepolia USDC address (default included) |
| `AAVE_POOL` | No | Aave V3 Sepolia pool address |
| `PORT` | No | Server port (default: 3000) |

## Architecture

```
tsentry/
├── src/
│   ├── server.js              # Express dashboard + REST API (25 endpoints)
│   ├── mcp-server.js          # WDK MCP server (42 tools, stdio transport)
│   ├── agent/
│   │   ├── treasury.js        # Core autonomous agent loop
│   │   ├── strategies.js      # 4 pre-built allocation strategies
│   │   └── llm.js             # Claude API reasoning engine
│   ├── wdk/
│   │   └── wallet-adapter.js  # WDK → ethers.js signer bridge
│   └── evm/
│       ├── wallet.js          # Direct ethers.js wallet ops
│       ├── aave.js            # Aave V3 lending module
│       ├── swap.js            # Uniswap V3 swap module
│       ├── bridge.js          # USDT0 LayerZero V2 bridge
│       └── pricing.js         # Bitfinex/CoinGecko price feeds
├── web/
│   └── views/
│       └── index.html         # Dashboard (single-page, Dracula theme)
├── openclaw.json              # MCP server registration for OpenClaw
├── .env.example               # Environment template
└── package.json
```

## API Endpoints

### Read
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Agent status, wallet, strategy |
| GET | `/api/portfolio` | Balances, Aave positions, prices |
| GET | `/api/actions` | Recent action log |
| GET | `/api/snapshot` | Full agent state |
| GET | `/api/llm` | LLM reasoning state |
| GET | `/api/swap/pairs` | Available swap pairs |
| GET | `/api/bridge/chains` | Supported bridge chains |

### Control
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/start` | Start autonomous loop |
| POST | `/api/stop` | Stop agent |
| POST | `/api/pause` | Toggle pause |
| POST | `/api/strategy` | Set strategy |
| POST | `/api/cycle` | Run single cycle |
| POST | `/api/refresh` | Refresh on-chain data |
| POST | `/api/llm/toggle` | Toggle LLM on/off |
| POST | `/api/llm/reason` | Ask AI for analysis |

### Actions
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/supply` | Supply to Aave |
| POST | `/api/withdraw` | Withdraw from Aave |
| POST | `/api/swap/quote` | Get swap quote |
| POST | `/api/swap/execute` | Execute swap |
| POST | `/api/bridge/quote` | Get bridge quote |
| POST | `/api/bridge/quote-all` | Compare all bridge routes |
| POST | `/api/bridge/execute` | Execute bridge |

## Tech Stack

- **Runtime**: Node.js >= 22 (ES modules)
- **Wallet**: Tether WDK (`@tetherto/wdk-wallet-evm`) + ethers.js v6
- **Protocols**: Aave V3, Uniswap V3 (Velora), USDT0 (LayerZero V2), MoonPay
- **AI**: Anthropic Claude Haiku 4.5 (`@anthropic-ai/sdk`)
- **MCP**: `@modelcontextprotocol/sdk` + `@tetherto/wdk-mcp-toolkit`
- **Web**: Express 4
- **Network**: Ethereum Sepolia testnet

## OpenClaw Integration

Register Tsentry as an MCP server in OpenClaw:

```json
{
  "mcpServers": {
    "tsentry-wdk": {
      "command": "node",
      "args": ["src/mcp-server.js"],
      "env": {
        "WDK_SEED": "${WDK_SEED}",
        "ETH_PRIVATE_KEY": "${ETH_PRIVATE_KEY}",
        "ETH_RPC_URL": "${ETH_RPC_URL}",
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

AI agents can then use natural language:
- *"What's in my treasury?"* → `tsentry_portfolio`
- *"Swap 100 USDT for USDC"* → `tsentry_swap_execute`
- *"Supply 0.005 WETH to Aave"* → `tsentry_supply`
- *"Compare bridge fees from Ethereum"* → `tsentry_bridge_routes`
- *"Analyze my portfolio risk"* → `tsentry_ask_ai`

## License

Apache 2.0 — See [LICENSE](LICENSE)
