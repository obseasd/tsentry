# Tsentry

**Autonomous Multi-Chain Treasury Agent** powered by [Tether WDK](https://github.com/nickinopen-claw/wdk) and [OpenClaw](https://github.com/nickinopen-claw/openclaw).

Tsentry is an AI-powered treasury agent that autonomously manages digital asset portfolios: monitoring positions, rebalancing allocations, lending for yield, swapping tokens, bridging cross-chain, and enabling machine-to-machine payments — all through a single seed phrase via the Tether Wallet Development Kit.

> Built for **Tether Hackathon Galactica: WDK Edition 1** | **8/8 WDK modules integrated**

## How It Works

```
Seed Phrase (WDK_SEED)
    │
    ▼
┌──────────────────────────────────────────────────────────────────┐
│  Tether WDK                                                      │
│  BIP-39 → BIP-44 derivation → EVM wallet                        │
│  + Aave + Velora + USDT0 Bridge + MoonPay + ERC-4337 + x402     │
└────────────────────────┬─────────────────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
     ┌──────▼──────┐          ┌───────▼──────┐
     │  Dashboard   │          │  MCP Server  │
     │  (Express)   │          │  (OpenClaw)  │
     │  Port 3000   │          │  44 tools    │
     └──────┬───────┘          └───────┬──────┘
            │                          │
     ┌──────▼──────────────────────────▼──────┐
     │         TreasuryAgent Core              │
     │  refresh → evaluate → propose → execute │
     │                                         │
     │  ┌────────────┐  ┌───────────────────┐  │
     │  │ LLM Engine │  │ Rule-Based Safety │  │
     │  │  (Claude)  │◄─│   (deterministic) │  │
     │  └────────────┘  └───────────────────┘  │
     │                                         │
     │  ┌────────┬────────┬────────┬─────────┐ │
     │  │ Aave   │ Velora │ USDT0  │ERC-4337 │ │
     │  │Lending │  Swap  │ Bridge │Smart Acc│ │
     │  └────────┴────────┴────────┴─────────┘ │
     │  ┌───────────────────────────┐          │
     │  │  x402 Payment Protocol    │          │
     │  │  (USDT0 micropayments)    │          │
     │  └───────────────────────────┘          │
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
- **Natural Language Commands**: pattern-matched parsing + LLM fallback — type "supply 100 USDT" or "swap all DAI to USDC" in plain English
- **Rule-based safety net**: deterministic rules always run alongside LLM — critical alerts propagate regardless of AI output
- **Adaptive polling**: LLM suggests optimal check intervals (30s → 1h) based on market volatility
- **5 strategies**: Conservative, Balanced, Aggressive, USDT Yield (default), Tether Diversified

### DeFi Protocols
- **Aave V3 Lending** — supply/withdraw/borrow with health factor monitoring, supply cap detection
- **Velora DEX Aggregator** — WDK-native, routes through 160+ protocols for best price (mainnet); Uniswap V3 fallback on testnet
- **USDT0 Bridge** — LayerZero V2 cross-chain bridging (26+ chains: Ethereum, Arbitrum, Berachain, Ink, Unichain...)
- **MoonPay** — fiat on/off-ramp integration via WDK

### ERC-4337 Account Abstraction
- **Safe Smart Account** — predicted from EOA owner via `@tetherto/wdk-wallet-evm-erc-4337`
- **Gasless transactions** — pay gas in USDT (paymaster mode) or get sponsored gas
- **Batched operations** — multiple tx in a single UserOperation
- **3 modes**: native (ETH gas), paymaster (USDT gas), sponsored (free gas)
- Compatible with Pimlico, Alchemy, and other ERC-4337 bundlers

### x402 Agentic Payments
- **Machine-to-machine USDT0 micropayments** via HTTP 402 protocol
- **`@t402/*` packages** — Tether's implementation of the x402 payment standard (EIP-3009 `transferWithAuthorization`)
- **Server**: Express middleware gates premium endpoints behind USDT0 payments
- **Client**: Wrapped fetch auto-pays on HTTP 402 responses (gasless for payer)
- **Facilitator**: `https://facilitator.t402.io` verifies and settles payments on-chain

| Gated Endpoint | Price | Description |
|----------------|-------|-------------|
| `GET /api/snapshot` | $0.01 USDT | Full agent snapshot |
| `POST /api/swap/execute` | $0.10 USDT | Execute on-chain swap |
| `POST /api/bridge/execute` | $0.10 USDT | Execute cross-chain bridge |
| `POST /api/llm/reason` | $0.05 USDT | AI-powered reasoning |

### USDT Yield Strategy
The default Tether-centric strategy:
- 70% deployed to Aave lending (USDT priority)
- Consolidates DAI/USDC → USDT when non-USDT stablecoins exceed 30%
- Maintains $500 USDT wallet reserve
- Supply priority: USDT → USDC → DAI → WETH

### MCP Server (44 Tools)
Full Model Context Protocol server for AI agent interoperability via OpenClaw:

| Category | Tools | Count |
|----------|-------|-------|
| Wallet | get_address, get_balance, transfer, sign, verify | ~8 |
| Swap | quote_swap, swap (Velora) | ~5 |
| Bridge | quote_bridge, bridge (USDT0) | ~4 |
| Lending | quote_supply, supply, quote_withdraw, withdraw, borrow | ~8 |
| Pricing | get_current_price, get_historical_price | ~4 |
| Fiat | quote_buy, buy, quote_sell, sell (MoonPay) | ~4 |
| **Tsentry Custom** | portfolio, overview, swap_quote, swap_execute, bridge_quote, bridge_routes, supply, withdraw, ask_ai, **x402_status, x402_fetch** | **11** |

### Dashboard
- Real-time portfolio overview (wallet + Aave positions)
- **Allocation donut chart** — live portfolio breakdown (Chart.js)
- Dracula-themed UI with live price feeds
- **Command Center** — natural language input bar with hint chips (supply, withdraw, swap, bridge, strategy, start, "ask AI")
- Agent controls: start/stop/pause, strategy picker, manual cycle
- Supply/withdraw directly from UI
- Swap quotes + execution
- Bridge route comparison
- AI Reasoning panel: toggle LLM, view latest analysis, Ask AI input
- Action log with type-coded icons (AI, NL, x402, Error, Swap, Info)
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
| `ERC4337_BUNDLER_URL` | No | ERC-4337 bundler (e.g. Pimlico) — enables Smart Account |
| `ERC4337_PAYMASTER_URL` | No | Paymaster service for gasless tx (USDT gas) |
| `X402_NETWORK` | No | x402 payment network (e.g. `eip155:42161` for Arbitrum) |
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
│   ├── mcp-server.js          # WDK MCP server (44 tools, stdio transport)
│   ├── agent/
│   │   ├── treasury.js        # Core autonomous agent loop
│   │   ├── strategies.js      # 5 pre-built allocation strategies
│   │   ├── llm.js             # Claude API reasoning engine
│   │   └── *.test.js          # Unit tests (node:test)
│   ├── wdk/
│   │   ├── wallet-adapter.js  # WDK → ethers.js signer bridge
│   │   └── erc4337-adapter.js # ERC-4337 Smart Account (Safe)
│   ├── evm/
│   │   ├── wallet.js          # Direct ethers.js wallet ops
│   │   ├── aave.js            # Aave V3 lending module
│   │   ├── swap.js            # Uniswap V3 swap module
│   │   ├── velora.js          # Velora DEX aggregator (160+ DEXs)
│   │   ├── bridge.js          # USDT0 LayerZero V2 bridge
│   │   └── pricing.js         # Bitfinex/CoinGecko price feeds
│   └── x402/
│       ├── server.js          # HTTP 402 payment middleware (@t402/express)
│       └── client.js          # Agent payment client (@t402/fetch)
├── web/
│   └── views/
│       └── index.html         # Dashboard (single-page, Dracula theme)
├── skills/
│   └── tsentry/
│       ├── SKILL.md           # Agent skill manifest
│       └── references/        # API + WDK module docs
├── .github/workflows/ci.yml   # GitHub Actions CI
├── openclaw.json              # MCP server registration for OpenClaw
├── .env.example               # Environment template
└── package.json
```

## API Endpoints

### Read
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health, uptime, module status |
| GET | `/api/status` | Agent status, wallet, strategy |
| GET | `/api/portfolio` | Balances, Aave positions, prices |
| GET | `/api/actions` | Recent action log |
| GET | `/api/snapshot` | Full agent state (**x402**: $0.01) |
| GET | `/api/llm` | LLM reasoning state |
| GET | `/api/swap/pairs` | Available swap pairs |
| GET | `/api/bridge/chains` | Supported bridge chains |
| GET | `/api/history` | WDK-indexed transfer history |
| GET | `/api/skills` | Agent skill manifest (8 WDK modules) |

### Control
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/start` | Start autonomous loop |
| POST | `/api/stop` | Stop agent |
| POST | `/api/pause` | Toggle pause |
| POST | `/api/strategy` | Set strategy (CONSERVATIVE, BALANCED, AGGRESSIVE, USDT_YIELD, TETHER_DIVERSIFIED) |
| POST | `/api/cycle` | Run single cycle |
| POST | `/api/refresh` | Refresh on-chain data |
| POST | `/api/command` | Natural language commands (pattern match + LLM fallback) |
| POST | `/api/llm/toggle` | Toggle LLM on/off |
| POST | `/api/llm/reason` | Ask AI for analysis (**x402**: $0.05) |

### Actions
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/supply` | Supply to Aave (**x402**: $0.10) |
| POST | `/api/withdraw` | Withdraw from Aave (**x402**: $0.10) |
| POST | `/api/swap/quote` | Get swap quote |
| POST | `/api/swap/execute` | Execute swap (**x402**: $0.10) |
| POST | `/api/bridge/quote` | Get bridge quote |
| POST | `/api/bridge/quote-all` | Compare all bridge routes |
| POST | `/api/bridge/execute` | Execute bridge (**x402**: $0.10) |

### ERC-4337 Smart Account
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/erc4337` | Smart Account status |
| POST | `/api/erc4337/quote-transfer` | Quote gasless transfer fee |
| POST | `/api/erc4337/transfer` | Execute gasless transfer |

### x402 Agentic Payments
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/x402` | Payment gate status |
| GET | `/api/x402/revenue` | Revenue tracking summary |

## Demo

### Interactive CLI Demo
```bash
npm run demo          # Step-by-step walkthrough (pauses between steps)
npm run demo:fast     # Same demo, no pauses
```

Demonstrates: wallet info, portfolio, pricing, strategy, Aave supply/withdraw, swap quote/execute, bridge quote, NL commands, LLM reasoning, agent start/stop/pause, x402 status.

### Agent-to-Agent Payment Demo
```bash
npm run demo:a2a                          # Simulated mode (no real payments)
AGENT_B_KEY=0x... npm run demo:a2a        # Live x402 payments
```

Visual demo of two autonomous agents transacting via x402: Agent B pays Agent A in USDT0 for premium API access (portfolio snapshots, swap execution, bridge execution). Includes ASCII art, flow diagrams, and a summary table.

### Tests
```bash
npm test              # Run all unit tests (node:test)
```

### Docker
```bash
docker compose up -d  # Start Tsentry in production mode
```

## WDK Modules (8/8)

| # | Module | Package | Purpose |
|---|--------|---------|---------|
| 1 | Wallet EVM | `@tetherto/wdk-wallet-evm` | BIP-39/44 wallet, signing, balances |
| 2 | Wallet ERC-4337 | `@tetherto/wdk-wallet-evm-erc-4337` | Gasless tx, Safe smart account |
| 3 | Swap Velora | `@tetherto/wdk-protocol-swap-velora-evm` | DEX aggregation (160+ protocols) |
| 4 | Lending Aave | `@tetherto/wdk-protocol-lending-aave-evm` | Supply, withdraw, borrow, eMode |
| 5 | Bridge USDT0 | `@tetherto/wdk-protocol-bridge-usdt0-evm` | Cross-chain via LayerZero V2 OFT |
| 6 | MCP Toolkit | `@tetherto/wdk-mcp-toolkit` | 44-tool AI agent interface |
| 7 | Agent Skills | `tetherto/wdk-agent-skills` | Interoperability standard |
| 8 | x402 Payments | `@t402/wdk` + `@t402/express` | HTTP 402 USDT0 micropayments (EIP-3009) |

> **Note:** `@t402/*` packages are Tether's implementation of the [x402 payment protocol](https://www.x402.org/) for USDT0. The protocol was originally designed by Coinbase as `@x402/*` for USDC. Tether's implementation uses EIP-3009 `transferWithAuthorization` for gasless client payments — the payer signs off-chain, the facilitator settles on-chain.

## Tech Stack

- **Runtime**: Node.js >= 22 (ES modules)
- **Wallet**: Tether WDK (`@tetherto/wdk-wallet-evm`) + ethers.js v6
- **Smart Account**: `@tetherto/wdk-wallet-evm-erc-4337` (Safe, EntryPoint v0.7)
- **Protocols**: Aave V3, Velora (160+ DEXs), USDT0 (LayerZero V2), MoonPay
- **Payments**: `@t402/wdk` + `@t402/express` + `@t402/fetch` (x402 USDT0 micropayments)
- **AI**: Anthropic Claude Haiku 4.5 (`@anthropic-ai/sdk`)
- **MCP**: `@modelcontextprotocol/sdk` + `@tetherto/wdk-mcp-toolkit` (44 tools)
- **Web**: Express 4
- **Network**: Ethereum Sepolia (testnet) / Arbitrum (mainnet, for x402)

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

## Natural Language Command Center

The `/api/command` endpoint accepts plain English instructions. The dashboard includes a Command Center bar with hint chips for common actions.

**Pattern-matched commands** (instant, no API call):
- `"supply 100 USDT"` → Aave supply
- `"withdraw all DAI"` → Aave withdraw
- `"swap 50 USDT to USDC"` → DEX swap
- `"bridge 100 USDT0 to arbitrum"` → Cross-chain bridge
- `"set strategy aggressive"` → Strategy change
- `"start"` / `"stop"` / `"pause"` / `"refresh"` → Agent control

**LLM fallback** (complex instructions): If no pattern matches and `ANTHROPIC_API_KEY` is set, the command is sent to Claude Haiku 4.5 for interpretation. High-confidence actions (≥ 0.7) are auto-executed.

### Conditional Rules Engine

Users can define custom automation rules in natural language. The LLM parses them into structured conditions + actions that the agent evaluates every cycle.

**Examples:**
- `"If APR drops by 5% from now, withdraw all from lending and convert to USDT"` — monitors APR, auto-exits if yield deteriorates
- `"Put 60 USDT in Aave lending, if health factor drops below 1.3 withdraw everything"` — safe lending with automatic unwinding
- `"If ETH price drops below $2000, swap all WETH to USDT"` — price-triggered hedging
- `"If USDT balance exceeds 500, supply the excess to Aave"` — auto-deploy idle capital

Rules support one-shot (trigger once) and continuous (keep monitoring) modes. Each rule tracks its trigger count and can be removed at any time.

**API:**
- `POST /api/rules` — Create rule from natural language (`{text}`) or structured object (`{rule}`)
- `GET /api/rules` — List all rules with status
- `DELETE /api/rules/:id` — Remove a rule

## Third-party Disclosures

| Package | License | Use |
|---------|---------|-----|
| `@tetherto/wdk-*` | Tether proprietary | WDK wallet, swap, lending, bridge, MCP |
| `@t402/*` | MIT | x402 payment protocol |
| `@anthropic-ai/sdk` | MIT | Claude API for LLM reasoning |
| `@modelcontextprotocol/sdk` | MIT | MCP server |
| `ethers` | MIT | EVM interactions |
| `express` | MIT | Web server |
| `Chart.js` | MIT | Dashboard donut chart (CDN) |

## License

Apache 2.0 — See [LICENSE](LICENSE)
