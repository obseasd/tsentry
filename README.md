# Tsentry

**Autonomous Multi-Chain Treasury Agent** built with [Tether WDK](https://github.com/nickinopen-claw/wdk) and [OpenClaw](https://github.com/nickinopen-claw/openclaw).

Tsentry is an AI-powered treasury management agent that autonomously monitors, rebalances, and optimizes digital asset portfolios across multiple blockchains using the Tether Wallet Development Kit.

## Features

- **Multi-Chain Wallet Management** — Ethereum, Bitcoin, Solana (via WDK)
- **DeFi Protocol Integration** — Lending (Aave), Swaps (Velora), Bridges (USDT0), Fiat on/off-ramp (MoonPay)
- **Autonomous Strategy Execution** — Configure risk tolerance and let the agent manage allocations
- **Real-Time Price Monitoring** — Bitfinex pricing feeds for market awareness
- **MCP-Native** — Full Model Context Protocol server for AI agent interoperability
- **Web Dashboard** — Monitor treasury state, positions, and agent actions

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your WDK_SEED (12-word mnemonic)

# Start the dashboard
npm run dev

# Or run the MCP server (for OpenClaw / AI agents)
npm run mcp
```

## Architecture

```
src/
  mcp-server.js     — WDK MCP server (stdio transport)
  server.js         — Express dashboard + API
  agent/
    treasury.js     — Core treasury agent logic
    strategies.js   — Pre-built allocation strategies
web/
  views/            — Dashboard HTML
  public/           — Static assets
```

## WDK Tools Exposed via MCP

| Category | Tools |
|----------|-------|
| Wallet | get_address, get_balance, transfer, sign, verify |
| Swap | quote_swap, swap (Velora) |
| Bridge | quote_bridge, bridge (USDT0) |
| Lending | quote_supply, supply, quote_withdraw, withdraw, quote_borrow, borrow |
| Pricing | get_current_price, get_historical_price |
| Fiat | quote_buy, buy, quote_sell, sell |

## License

Apache 2.0 — See [LICENSE](LICENSE)
