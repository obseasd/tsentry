---
name: tsentry
description: Tsentry is an autonomous multi-chain treasury management agent built on Tether WDK. It manages USDT-centric portfolios across DeFi protocols (Aave lending, Velora DEX aggregation, USDT0 bridging) with AI-powered reasoning (Claude), ERC-4337 Account Abstraction for gasless operations, and x402 protocol for machine-to-machine USDT0 micropayments.
---

# Tsentry — Autonomous Treasury Agent

## Architecture

```
User / AI Agent
    |
    v
Dashboard (Express) ──── MCP Server (44 tools)
    |                         |
    v                         v
TreasuryAgent ───────── LLM Reasoning (Claude Haiku)
    |
    ├── WDK Wallet (EOA + ERC-4337 Smart Account)
    ├── Velora Swap (160+ DEX aggregator)
    ├── Aave V3 Lending (supply/withdraw/borrow)
    ├── USDT0 Bridge (LayerZero, 26+ chains)
    ├── x402 Payments (USDT0 micropayments via HTTP 402)
    └── Rule-based Safety Net
```

## WDK Modules Used (8/8)

| Module | Package | Purpose |
|--------|---------|---------|
| Wallet EVM | `@tetherto/wdk-wallet-evm` | BIP-39/44 wallet, signing, balances |
| Wallet ERC-4337 | `@tetherto/wdk-wallet-evm-erc-4337` | Gasless tx, batched ops, Safe smart account |
| Swap Velora | `@tetherto/wdk-protocol-swap-velora-evm` | DEX aggregation (160+ protocols) |
| Lending Aave | `@tetherto/wdk-protocol-lending-aave-evm` | Supply, withdraw, borrow, eMode |
| Bridge USDT0 | `@tetherto/wdk-protocol-bridge-usdt0` | Cross-chain via LayerZero V2 OFT |
| MCP Toolkit | `@tetherto/wdk-mcp-toolkit` | 44-tool AI agent interface |
| Agent Skills | `tetherto/wdk-agent-skills` | Interoperability standard |
| x402 Payments | `@t402/wdk` + `@t402/express` | HTTP 402 USDT0 micropayments (EIP-3009) |

## Agent Loop

The treasury agent runs an autonomous cycle:

1. **Refresh** — Fetch on-chain balances, Aave positions, live prices
2. **Evaluate** — LLM reasoning (Claude) + rule-based safety checks
3. **Propose** — Generate actions (supply, withdraw, swap, alert)
4. **Execute** — On-chain execution with slippage protection
5. **Log** — Record all decisions and outcomes
6. **Sleep** — Wait for next cycle (interval adjustable by LLM)

## Strategies

- **USDT Yield** — 70% lending allocation, consolidate DAI/USDC to USDT
- **Conservative** — 80% lending, minimal swaps, safety-first
- **Balanced** — 50% lending, diversified stablecoins
- **Aggressive** — 30% lending, active rebalancing

## Security Rules

- Never expose private keys or seed phrases
- Always estimate gas before execution
- Validate all addresses before transactions
- Rate-limit on-chain operations
- Health factor monitoring for leveraged positions
- Supply cap detection and automatic skip

## API Endpoints

See `references/api.md` for the complete API reference.

## Common Operations

### Quote a swap
```
POST /api/swap/quote { tokenIn: "USDT", tokenOut: "USDC", amount: 100 }
```

### Supply to Aave
```
POST /api/supply { token: "USDT", amount: 500 }
```

### Bridge USDT0 cross-chain
```
POST /api/bridge/quote { sourceChain: "ethereum", targetChain: "arbitrum", amount: 100 }
```

### Gasless transfer (ERC-4337)
```
POST /api/erc4337/transfer { token: "USDT", to: "0x...", amount: 50 }
```

### x402 payment status
```
GET /api/x402
```

### Access x402-gated endpoint (auto-pays with USDT0)
```
GET /api/snapshot  (with x402 payment header — $0.01 per call)
```
