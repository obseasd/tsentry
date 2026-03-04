#!/usr/bin/env bash
# Tsentry — Hackathon Demo Script
# Walks through all features in sequence for the Galactica WDK Edition presentation
#
# Prerequisites:
#   1. Tsentry running: npm run dev
#   2. Wallet funded on Sepolia (ETH + test tokens)
#
# Usage:
#   chmod +x scripts/demo.sh
#   ./scripts/demo.sh [--fast]    # --fast skips pauses between steps

set -uo pipefail

BASE="${TSENTRY_URL:-http://127.0.0.1:3000}"
FAST="${1:-}"
CYAN='\033[36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'
BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'

step=0

pause() {
  if [[ "$FAST" != "--fast" ]]; then
    echo -e "${DIM}  Press Enter to continue...${RESET}"
    read -r
  fi
}

header() {
  step=$((step + 1))
  echo ""
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}  Step $step: $1${RESET}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo ""
}

api() {
  local method="$1"
  local endpoint="$2"
  local data="${3:-}"
  local out

  echo -e "  ${CYAN}${method} ${BASE}${endpoint}${RESET}"

  if [[ "$method" == "GET" ]]; then
    out=$(curl -4 -s --connect-timeout 5 "${BASE}${endpoint}" 2>&1 || echo '{"error":"connection refused"}')
  else
    if [[ -n "$data" ]]; then
      echo -e "  ${DIM}Body: ${data}${RESET}"
      out=$(curl -4 -s --connect-timeout 5 -X "$method" "${BASE}${endpoint}" -H "Content-Type: application/json" -d "$data" 2>&1 || echo '{"error":"connection refused"}')
    else
      out=$(curl -4 -s --connect-timeout 5 -X "$method" "${BASE}${endpoint}" 2>&1 || echo '{"error":"connection refused"}')
    fi
  fi

  # Pretty-print JSON if python available
  local py
  py=$(command -v python3 2>/dev/null || command -v python 2>/dev/null || echo "")
  if [[ -n "$py" ]]; then
    echo "$out" | "$py" -m json.tool 2>/dev/null || echo "$out"
  else
    echo "$out"
  fi
  echo ""
}

# ─── Title ───

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║                                                              ║${RESET}"
echo -e "${BOLD}║   ${GREEN}TSENTRY${RESET}${BOLD} — Autonomous Multi-Chain Treasury Agent          ║${RESET}"
echo -e "${BOLD}║   Powered by Tether WDK (8/8 modules integrated)            ║${RESET}"
echo -e "${BOLD}║                                                              ║${RESET}"
echo -e "${BOLD}║   ${DIM}Galactica: WDK Edition 1 Hackathon Demo${RESET}${BOLD}                  ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""

# ─── 1. Agent Status ───

header "Agent Status & WDK Wallet"
echo -e "  ${DIM}Tsentry initializes with WDK wallet (seed phrase) or ethers.js fallback${RESET}"
echo -e "  ${DIM}WDK Module: @tetherto/wdk-wallet-evm${RESET}"
echo ""
api GET /api/status
pause

# ─── 2. Skills / WDK Modules ───

header "Agent Skills — 8/8 WDK Modules"
echo -e "  ${DIM}All 8 Tether WDK modules integrated as autonomous agent skills${RESET}"
echo ""
api GET /api/skills
pause

# ─── 3. Portfolio & Balances ───

header "Portfolio — On-Chain Balances + Aave Positions"
echo -e "  ${DIM}Real-time balances from WDK wallet + Aave lending positions${RESET}"
echo -e "  ${DIM}WDK Module: @tetherto/wdk-protocol-lending-aave-evm${RESET}"
echo ""
api GET /api/portfolio
pause

# ─── 4. Strategy ───

header "Strategy Engine — USDT Yield (Default)"
echo -e "  ${DIM}5 built-in strategies: Conservative, Balanced, Aggressive, USDT Yield, Tether Diversified${RESET}"
echo -e "  ${DIM}USDT Yield: 70% lending, 10% liquidity, 20% reserve — consolidates to USDT${RESET}"
echo ""

echo -e "  ${YELLOW}Switching to Tether Diversified (USAt + XAUt awareness):${RESET}"
api POST /api/strategy '{"name":"TETHER_DIVERSIFIED"}'
echo -e "  ${YELLOW}Switching back to USDT Yield:${RESET}"
api POST /api/strategy '{"name":"USDT_YIELD"}'
pause

# ─── 5. Swap ───

header "DEX Swap — Velora Aggregator (160+ DEXs)"
echo -e "  ${DIM}WDK Module: @tetherto/wdk-protocol-swap-velora-evm${RESET}"
echo -e "  ${DIM}Velora on mainnet (ParaSwap-powered), Uniswap V3 fallback on testnet${RESET}"
echo ""
api GET /api/swap/pairs
echo -e "  ${YELLOW}Getting swap quote: 100 USDT → USDC${RESET}"
api POST /api/swap/quote '{"tokenIn":"USDT","tokenOut":"USDC","amount":100}'
pause

# ─── 6. Bridge ───

header "Cross-Chain Bridge — USDT0 via LayerZero"
echo -e "  ${DIM}WDK Module: @tetherto/wdk-protocol-bridge-usdt0${RESET}"
echo -e "  ${DIM}Bridge USDT0 across 26+ chains (Ethereum, Arbitrum, Base, Polygon, etc.)${RESET}"
echo ""
api GET /api/bridge/chains
echo -e "  ${YELLOW}Getting bridge quote: 100 USDT0 Ethereum → Arbitrum${RESET}"
api POST /api/bridge/quote '{"sourceChain":"ethereum","targetChain":"arbitrum","amount":100}'
pause

# ─── 7. ERC-4337 ───

header "ERC-4337 Account Abstraction — Gasless Transfers"
echo -e "  ${DIM}WDK Module: @tetherto/wdk-wallet-evm-erc-4337${RESET}"
echo -e "  ${DIM}Safe Smart Account — gasless transfers, batched transactions${RESET}"
echo -e "  ${DIM}3 modes: native (gas from smart account), paymaster (ERC-20 gas), sponsored${RESET}"
echo ""
api GET /api/erc4337
pause

# ─── 8. x402 Payment Protocol ───

header "x402 Agentic Payments — USDT0 Micropayments"
echo -e "  ${DIM}WDK Module: @t402/wdk (t402 protocol, NOT Coinbase x402)${RESET}"
echo -e "  ${DIM}HTTP 402 + EIP-3009 transferWithAuthorization = gasless micropayments${RESET}"
echo -e "  ${DIM}Gated endpoints: snapshot ($0.01), swap ($0.10), bridge ($0.10), LLM ($0.05)${RESET}"
echo ""
api GET /api/x402
echo ""
echo -e "  ${YELLOW}Revenue tracking:${RESET}"
api GET /api/x402/revenue
pause

# ─── 9. LLM Reasoning ───

header "LLM Reasoning — Claude-Powered Market Analysis"
echo -e "  ${DIM}Claude analyzes portfolio, market conditions, and proposes actions${RESET}"
echo -e "  ${DIM}Rule-based fallback when LLM unavailable — safety net always active${RESET}"
echo ""
api GET /api/llm
pause

# ─── 10. Agent Cycle ───

header "Autonomous Agent Cycle"
echo -e "  ${DIM}refresh → evaluate (LLM + rules) → execute → log → sleep → repeat${RESET}"
echo -e "  ${DIM}Transaction confirmation with retry (2x on transient errors)${RESET}"
echo ""
echo -e "  ${YELLOW}Triggering manual cycle:${RESET}"
api POST /api/cycle
pause

# ─── 11. Action Log ───

header "Action Log — Full Audit Trail"
echo -e "  ${DIM}Every action logged with timestamp, type, and execution result${RESET}"
echo ""
api GET "/api/actions?limit=10"
pause

# ─── 12. Agent-to-Agent Demo ───

header "Agent-to-Agent Payment Demo"
echo -e "  ${DIM}Agent B pays Agent A $0.01 USDT0 for portfolio snapshot${RESET}"
echo -e "  ${DIM}Running simulated demo...${RESET}"
echo ""
node scripts/demo-agent2agent.js --simulate 2>/dev/null || echo -e "  ${DIM}(Run separately: node scripts/demo-agent2agent.js --simulate)${RESET}"
pause

# ─── Summary ───

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║  ${GREEN}Demo Complete${RESET}${BOLD}                                                ║${RESET}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════════════╣${RESET}"
echo -e "${BOLD}║                                                              ║${RESET}"
echo -e "${BOLD}║  ${GREEN}✓${RESET}${BOLD} WDK Wallet — seed-based HD wallet (wdk-wallet-evm)       ║${RESET}"
echo -e "${BOLD}║  ${GREEN}✓${RESET}${BOLD} ERC-4337 — gasless Smart Account (wdk-wallet-evm-erc4337)║${RESET}"
echo -e "${BOLD}║  ${GREEN}✓${RESET}${BOLD} Velora — 160+ DEX aggregation (wdk-swap-velora)          ║${RESET}"
echo -e "${BOLD}║  ${GREEN}✓${RESET}${BOLD} Aave — supply/withdraw/borrow (wdk-lending-aave)         ║${RESET}"
echo -e "${BOLD}║  ${GREEN}✓${RESET}${BOLD} USDT0 Bridge — 26+ chains via LayerZero (wdk-bridge)     ║${RESET}"
echo -e "${BOLD}║  ${GREEN}✓${RESET}${BOLD} MCP Toolkit — 42 tools for AI interop (wdk-mcp-toolkit)  ║${RESET}"
echo -e "${BOLD}║  ${GREEN}✓${RESET}${BOLD} Agent Skills — WDK native actions (wdk-agent-skills)      ║${RESET}"
echo -e "${BOLD}║  ${GREEN}✓${RESET}${BOLD} x402 Payments — micropayments + revenue (t402-wdk)       ║${RESET}"
echo -e "${BOLD}║                                                              ║${RESET}"
echo -e "${BOLD}║  ${CYAN}5 strategies${RESET}${BOLD} — including Tether Diversified (USAt/XAUt)      ║${RESET}"
echo -e "${BOLD}║  ${CYAN}LLM reasoning${RESET}${BOLD} — Claude-powered with rule-based safety net   ║${RESET}"
echo -e "${BOLD}║  ${CYAN}Agent-to-agent${RESET}${BOLD} — autonomous x402 payments between agents    ║${RESET}"
echo -e "${BOLD}║  ${CYAN}Revenue tracking${RESET}${BOLD} — per-route payment analytics              ║${RESET}"
echo -e "${BOLD}║  ${CYAN}Input validation${RESET}${BOLD} — token/address/amount whitelist            ║${RESET}"
echo -e "${BOLD}║  ${CYAN}Rate limiting${RESET}${BOLD} — 3-tier (read/write/tx)                      ║${RESET}"
echo -e "${BOLD}║  ${CYAN}Tx confirmation${RESET}${BOLD} — receipt verification + retry               ║${RESET}"
echo -e "${BOLD}║                                                              ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
echo ""
