// Tsentry — WDK MCP Server
// Exposes wallet, swap, bridge, lending, pricing, fiat tools via MCP (stdio)

import 'dotenv/config'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  WdkMcpServer,
  WALLET_TOOLS,
  SWAP_TOOLS,
  BRIDGE_TOOLS,
  LENDING_TOOLS,
  PRICING_TOOLS,
  INDEXER_TOOLS,
  FIAT_TOOLS
} from '@tetherto/wdk-mcp-toolkit'

import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import VeloraProtocolEvm from '@tetherto/wdk-protocol-swap-velora-evm'
import Usdt0ProtocolEvm from '@tetherto/wdk-protocol-bridge-usdt0-evm'
import AaveProtocolEvm from '@tetherto/wdk-protocol-lending-aave-evm'
import FiatMoonpay from '@tetherto/wdk-protocol-fiat-moonpay'

const RPC_URL = process.env.ETH_RPC_URL || 'https://sepolia.drpc.org'

// Build server
const server = new WdkMcpServer('tsentry', '0.1.0')

// Init WDK core (seed from env)
server.useWdk({})

// Register Ethereum wallet
server.registerWallet('ethereum', WalletManagerEvm, {
  provider: RPC_URL
})

// Register testnet USDT token
server.registerToken('ethereum', 'USDT_TEST', {
  address: process.env.USDT_CONTRACT || '0xd077a400968890eacc75cdc901f0356c943e4fdb',
  decimals: 6
})

// Register protocols
server.registerProtocol('ethereum', 'velora', VeloraProtocolEvm)
server.registerProtocol('ethereum', 'usdt0', Usdt0ProtocolEvm)
server.registerProtocol('ethereum', 'aave', AaveProtocolEvm)
server.registerProtocol('ethereum', 'moonpay', FiatMoonpay)

// Enable pricing + indexer (if API key available)
server.usePricing()
if (process.env.WDK_INDEXER_API_KEY) {
  server.useIndexer({ apiKey: process.env.WDK_INDEXER_API_KEY })
}

// Register all tool categories
const tools = [
  ...WALLET_TOOLS,
  ...SWAP_TOOLS,
  ...BRIDGE_TOOLS,
  ...LENDING_TOOLS,
  ...PRICING_TOOLS,
  ...FIAT_TOOLS
]

if (process.env.WDK_INDEXER_API_KEY) {
  tools.push(...INDEXER_TOOLS)
}

server.registerTools(tools)

// Start stdio transport (for OpenClaw / MCP clients)
const transport = new StdioServerTransport()
await server.connect(transport)

console.error('[tsentry-mcp] Server running on stdio')
console.error(`[tsentry-mcp] Chains: ${server.getChains().join(', ')}`)
console.error(`[tsentry-mcp] Swap protocols: ${server.getSwapChains().map(c => `${c}:${server.getSwapProtocols(c)}`).join(', ')}`)
console.error(`[tsentry-mcp] Lending protocols: ${server.getLendingChains().map(c => `${c}:${server.getLendingProtocols(c)}`).join(', ')}`)
