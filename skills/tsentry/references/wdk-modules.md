# WDK Module Integration

## 1. wdk-wallet-evm
**Package**: `@tetherto/wdk-wallet-evm`
**Role**: Primary wallet — BIP-39 seed phrase, BIP-44 derivation, signing, balances
**File**: `src/wdk/wallet-adapter.js`
**Key class**: `WdkWalletAdapter` wraps `WalletManagerEvm`

## 2. wdk-wallet-evm-erc-4337
**Package**: `@tetherto/wdk-wallet-evm-erc-4337`
**Role**: Smart Account (Safe) for gasless transactions and batched operations
**File**: `src/wdk/erc4337-adapter.js`
**Key class**: `Erc4337Adapter` wraps `WalletManagerEvmErc4337`
**Modes**: native (ETH gas), paymaster (USDT gas), sponsored (free gas)

## 3. wdk-protocol-swap-velora-evm
**Package**: `@tetherto/wdk-protocol-swap-velora-evm`
**Role**: DEX aggregator — routes swaps through 160+ protocols for best price
**File**: `src/evm/velora.js`
**Key class**: `VeloraSwap` wraps `VeloraProtocolEvm`
**Fallback**: Uniswap V3 on testnets (`src/evm/swap.js`)

## 4. wdk-protocol-lending-aave-evm
**Package**: `@tetherto/wdk-protocol-lending-aave-evm`
**Role**: Lending via Aave V3 — supply, withdraw, borrow, repay, eMode
**File**: `src/evm/aave.js`
**Key class**: `AaveLending` (direct ethers.js integration)

## 5. wdk-protocol-bridge-usdt0
**Package**: `@tetherto/wdk-protocol-bridge-usdt0-evm`
**Role**: Cross-chain USDT0 bridging via LayerZero V2 OFT
**File**: `src/evm/bridge.js`
**Key class**: `Usdt0Bridge` (direct ethers.js + LayerZero)

## 6. wdk-mcp-toolkit
**Package**: `@tetherto/wdk-mcp-toolkit`
**Role**: Model Context Protocol server — 44 tools for AI agent interop
**File**: `src/mcp-server.js`
**Tools**: 33 WDK tools + 11 custom Tsentry tools (incl. x402)

## 7. wdk-agent-skills
**Source**: `tetherto/wdk-agent-skills` (GitHub)
**Role**: Agent interoperability standard — SKILL.md + reference docs
**Files**: `skills/tsentry/SKILL.md` + `skills/tsentry/references/`

## 8. t402-wdk (x402 Protocol)
**Packages**: `@t402/wdk` + `@t402/express` + `@t402/fetch` + `@t402/evm` + `@t402/core`
**Role**: HTTP 402 machine-to-machine USDT0 payments via EIP-3009
**Files**: `src/x402/server.js` (payment gate middleware), `src/x402/client.js` (agent payment client)
**Server**: Express middleware gates premium endpoints behind USDT0 micropayments
**Client**: Wrapped fetch auto-pays on 402 responses (gasless for payer via transferWithAuthorization)
**Facilitator**: `https://facilitator.t402.io` (verifies + settles payments on-chain)
