# Tsentry API Reference

## Status & Portfolio
- `GET /api/status` — Agent status, wallet info, strategy, uptime
- `GET /api/portfolio` — Balances, supplied, Aave account, prices
- `GET /api/actions` — Recent action log and errors
- `GET /api/snapshot` — Full agent snapshot (all data)

## Agent Control
- `POST /api/start` — Start autonomous loop (`{ intervalMs: 60000 }`)
- `POST /api/stop` — Stop autonomous loop
- `POST /api/pause` — Toggle pause (evaluates but doesn't execute)
- `POST /api/cycle` — Run single manual cycle
- `POST /api/refresh` — Refresh on-chain data
- `POST /api/strategy` — Set strategy (`{ name: "USDT_YIELD" }`)

## LLM Reasoning
- `GET /api/llm` — LLM status and last decision
- `POST /api/llm/toggle` — Enable/disable LLM reasoning
- `POST /api/llm/reason` — Manual LLM reasoning (`{ instruction: "..." }`)

## Lending (Aave V3)
- `POST /api/supply` — Supply token (`{ token: "USDT", amount: 100 }`)
- `POST /api/withdraw` — Withdraw token (`{ token: "USDT", amount: "max" }`)

## Swap (Velora / Uniswap)
- `GET /api/swap/pairs` — Available trading pairs
- `POST /api/swap/quote` — Quote swap (`{ tokenIn, tokenOut, amount, side }`)
- `POST /api/swap/execute` — Execute swap (`{ tokenIn, tokenOut, amount, slippage }`)

## Bridge (USDT0 / LayerZero)
- `GET /api/bridge/chains` — Supported chains and routes
- `POST /api/bridge/quote` — Quote bridge fee (`{ sourceChain, targetChain, amount }`)
- `POST /api/bridge/quote-all` — Quote all routes from source
- `POST /api/bridge/execute` — Execute bridge (`{ targetChain, amount, recipient }`)

## ERC-4337 Smart Account
- `GET /api/erc4337` — Smart Account status and info
- `POST /api/erc4337/quote-transfer` — Quote gasless transfer fee
- `POST /api/erc4337/transfer` — Execute gasless transfer via UserOperation

## x402 Agentic Payments
- `GET /api/x402` — Payment gate status (network, token, gated routes, pricing)

### Payment-Gated Endpoints (when x402 is active)
These endpoints return HTTP 402 with payment requirements. Clients auto-pay using
EIP-3009 `transferWithAuthorization` (gasless — no on-chain gas from payer).

| Endpoint | Price | Description |
|----------|-------|-------------|
| `GET /api/snapshot` | $0.01 USDT | Full agent snapshot |
| `POST /api/swap/execute` | $0.10 USDT | Execute on-chain swap |
| `POST /api/bridge/execute` | $0.10 USDT | Execute cross-chain bridge |
| `POST /api/llm/reason` | $0.05 USDT | AI-powered reasoning |

## Agent Skills
- `GET /api/skills` — Skill manifest (capabilities, WDK modules, status)
