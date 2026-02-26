# Tsentry — Project Rules

## Security (CRITICAL)
- NEVER hardcode private keys, seed phrases, or secrets in any file
- ALL secrets MUST use environment variables via process.env
- .env MUST be in .gitignore (already added)
- Before every commit: scan for hex strings > 40 chars, mnemonics, API keys
- Use .env.example for documenting required variables (no real values)

## Stack
- Node.js >= 22, ES modules ("type": "module")
- WDK (Wallet Development Kit) by Tether — @tetherto/wdk-*
- WDK MCP Toolkit — MCP server exposing wallet tools to AI agents
- OpenClaw — AI agent runtime with Skills system
- Express.js for web dashboard
- ethers.js v6 for direct EVM interactions beyond WDK protocols

## Architecture
- src/mcp-server.js — WDK MCP server (stdio transport for OpenClaw)
- src/server.js — Express web server (dashboard + API)
- src/agent/ — Agent logic, strategies, treasury management
- web/ — Frontend (views + static assets)

## Conventions
- ES module imports (import/export, not require)
- Async/await everywhere, no callbacks
- Error handling: try/catch with meaningful messages
- Testnet only until explicitly told otherwise (Sepolia)

## Hackathon Context
- Tether Hackathon Galactica: WDK Edition 1
- Track 1: Agent Wallets (WDK/OpenClaw Integration)
- Deadline: March 22, 2026
- Judging: Agent Intelligence, WDK Integration, Technical Execution, Agentic Payment Design, Originality, Polish, Presentation
