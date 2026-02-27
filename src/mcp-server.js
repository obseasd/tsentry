// Tsentry — WDK MCP Server
// Exposes WDK wallet/swap/bridge/lending tools + custom Tsentry agent tools via MCP

import 'dotenv/config'
import { z } from 'zod'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  WdkMcpServer,
  WALLET_TOOLS,
  SWAP_TOOLS,
  BRIDGE_TOOLS,
  LENDING_TOOLS,
  PRICING_TOOLS,
  FIAT_TOOLS
} from '@tetherto/wdk-mcp-toolkit'

import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import VeloraProtocolEvm from '@tetherto/wdk-protocol-swap-velora-evm'
import Usdt0ProtocolEvm from '@tetherto/wdk-protocol-bridge-usdt0-evm'
import AaveProtocolEvm from '@tetherto/wdk-protocol-lending-aave-evm'
import FiatMoonpay from '@tetherto/wdk-protocol-fiat-moonpay'

// Direct Tsentry modules (for custom tools)
import { EvmWallet } from './evm/wallet.js'
import { AaveLending } from './evm/aave.js'
import { UniswapSwap } from './evm/swap.js'
import { Usdt0Bridge } from './evm/bridge.js'
import { getPrices } from './evm/pricing.js'
import { LlmReasoning } from './agent/llm.js'

const RPC_URL = process.env.ETH_RPC_URL || 'https://sepolia.drpc.org'

// ─── Build WDK MCP Server ───

const server = new WdkMcpServer('tsentry', '0.1.0')

// Init WDK core (requires WDK_SEED env var)
if (process.env.WDK_SEED) {
  server.useWdk({})
  server.registerWallet('ethereum', WalletManagerEvm, { provider: RPC_URL })

  // Register protocols (require WDK wallet)
  server.registerProtocol('ethereum', 'velora', VeloraProtocolEvm)
  server.registerProtocol('ethereum', 'usdt0', Usdt0ProtocolEvm)
  server.registerProtocol('ethereum', 'aave', AaveProtocolEvm)
  server.registerProtocol('ethereum', 'moonpay', FiatMoonpay)
} else {
  console.error('[tsentry-mcp] WDK_SEED not set — WDK wallet tools disabled')
}

// Register all testnet tokens
server.registerToken('ethereum', 'USDT', {
  address: process.env.USDT_CONTRACT || '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
  decimals: 6
})
server.registerToken('ethereum', 'DAI', {
  address: process.env.DAI_CONTRACT || '0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357',
  decimals: 18
})
server.registerToken('ethereum', 'USDC', {
  address: process.env.USDC_CONTRACT || '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
  decimals: 6
})
server.registerToken('ethereum', 'WETH', {
  address: process.env.WETH_CONTRACT || '0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c',
  decimals: 18
})

// Enable pricing
server.usePricing()

// ─── Initialize Tsentry Direct Modules (for custom tools) ───

let wallet, aave, swap, bridge

try {
  if (process.env.ETH_PRIVATE_KEY) {
    const { ethers } = await import('ethers')
    const provider = new ethers.JsonRpcProvider(RPC_URL)
    const signer = new ethers.Wallet(process.env.ETH_PRIVATE_KEY, provider)

    const tokens = {
      USDT: { address: process.env.USDT_CONTRACT, decimals: 6 },
      DAI: { address: process.env.DAI_CONTRACT, decimals: 18 },
      USDC: { address: process.env.USDC_CONTRACT, decimals: 6 },
      WETH: { address: process.env.WETH_CONTRACT, decimals: 18 }
    }

    wallet = new EvmWallet({
      privateKey: process.env.ETH_PRIVATE_KEY,
      rpcUrl: RPC_URL,
      tokens
    })

    aave = new AaveLending({
      signer,
      poolAddress: process.env.AAVE_POOL,
      tokens
    })

    swap = new UniswapSwap({ signer, tokens })
    bridge = new Usdt0Bridge({ signer })

    console.error('[tsentry-mcp] Direct modules initialized')
  }
} catch (e) {
  console.error('[tsentry-mcp] Direct modules failed:', e.message)
}

// ─── Custom Tsentry Tools ───

function tsentryPortfolio (server) {
  server.registerTool(
    'tsentry_portfolio',
    {
      title: 'Tsentry Portfolio Overview',
      description: `Get full portfolio overview of the Tsentry treasury agent.

Returns wallet balances (ETH, USDT, DAI, USDC, WETH), Aave supplied positions,
health factor, total USD value, and live prices.

This is a read-only operation querying Sepolia testnet.

Examples:
  - "What's in my treasury?"
  - "Show portfolio status"
  - "How much do I have supplied in Aave?"`,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async () => {
      try {
        if (!wallet || !aave) throw new Error('Direct modules not initialized (need ETH_PRIVATE_KEY)')

        const [balances, supplied, aaveAccount, prices] = await Promise.all([
          wallet.getAllBalances(),
          aave.getAllSupplied(),
          aave.getAccountData(),
          getPrices(['ETH', 'USDT', 'DAI', 'USDC'])
        ])

        const ethPrice = prices?.ETH?.usd || 2600
        const walletUSD = (balances.USDT || 0) + (balances.DAI || 0) + (balances.USDC || 0) +
          (balances.WETH || 0) * ethPrice + (balances.ETH || 0) * ethPrice
        const suppliedUSD = (supplied.USDT || 0) + (supplied.DAI || 0) + (supplied.USDC || 0) +
          (supplied.WETH || 0) * ethPrice
        const totalUSD = walletUSD + suppliedUSD

        const text = [
          `Tsentry Portfolio — $${totalUSD.toFixed(2)} total`,
          '',
          'Wallet Balances:',
          ...Object.entries(balances).filter(([, v]) => v > 0.0001).map(([k, v]) => `  ${k}: ${v < 0.01 ? v.toFixed(6) : v.toFixed(2)}`),
          '',
          'Aave Supplied:',
          ...Object.entries(supplied).filter(([, v]) => v > 0.0001).map(([k, v]) => `  ${k}: ${v < 0.01 ? v.toFixed(6) : v.toFixed(2)}`),
          '',
          `Health Factor: ${aaveAccount.healthFactor > 1e10 ? '∞ (no borrows)' : aaveAccount.healthFactor.toFixed(2)}`,
          `Total Collateral: $${aaveAccount.totalCollateralUSD.toFixed(2)}`,
          `Wallet: $${walletUSD.toFixed(2)} | Supplied: $${suppliedUSD.toFixed(2)}`,
          `Lending ratio: ${totalUSD > 0 ? ((suppliedUSD / totalUSD) * 100).toFixed(1) : '0.0'}%`
        ].join('\n')

        return {
          content: [{ type: 'text', text }],
          structuredContent: { balances, supplied, aaveAccount, totalUSD, walletUSD, suppliedUSD, prices }
        }
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${e.message}` }] }
      }
    }
  )
}

function tsentrySwapQuote (server) {
  server.registerTool(
    'tsentry_swap_quote',
    {
      title: 'Tsentry Swap Quote',
      description: `Get a DEX swap quote via Uniswap V3 on Sepolia testnet.

Supports: USDT, DAI, USDC, WETH pairs.
Returns expected output amount, pool fee tier, and gas estimate.

Args:
  - tokenIn (REQUIRED): Token to sell (USDT, DAI, USDC, WETH)
  - tokenOut (REQUIRED): Token to buy
  - amount (REQUIRED): Amount to sell (human-readable, e.g. 100)

Examples:
  - "Quote 100 USDT to USDC"
  - "How much DAI would I get for 500 USDT?"`,
      inputSchema: z.object({
        tokenIn: z.enum(['USDT', 'DAI', 'USDC', 'WETH']).describe('Token to sell'),
        tokenOut: z.enum(['USDT', 'DAI', 'USDC', 'WETH']).describe('Token to buy'),
        amount: z.number().positive().describe('Amount to sell')
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ tokenIn, tokenOut, amount }) => {
      try {
        if (!swap) throw new Error('Swap module not initialized')
        if (tokenIn === tokenOut) throw new Error('tokenIn and tokenOut must differ')

        const quote = await swap.quote(tokenIn, tokenOut, amount)

        const text = `Swap Quote: ${amount} ${tokenIn} → ${quote.amountOut.toFixed(6)} ${tokenOut}\nPool fee: ${(quote.fee / 10000).toFixed(2)}%`

        return {
          content: [{ type: 'text', text }],
          structuredContent: quote
        }
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${e.message}` }] }
      }
    }
  )
}

function tsentrySwapExecute (server) {
  server.registerTool(
    'tsentry_swap_execute',
    {
      title: 'Tsentry Execute Swap',
      description: `Execute a token swap via Uniswap V3 on Sepolia testnet.

This is a WRITE operation — it will spend tokens from your wallet.
Supports: USDT, DAI, USDC, WETH pairs. Default 2% slippage.

Args:
  - tokenIn (REQUIRED): Token to sell
  - tokenOut (REQUIRED): Token to buy
  - amount (REQUIRED): Amount to sell

Examples:
  - "Swap 100 USDT for USDC"
  - "Sell 50 DAI for WETH"`,
      inputSchema: z.object({
        tokenIn: z.enum(['USDT', 'DAI', 'USDC', 'WETH']).describe('Token to sell'),
        tokenOut: z.enum(['USDT', 'DAI', 'USDC', 'WETH']).describe('Token to buy'),
        amount: z.number().positive().describe('Amount to sell')
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
    },
    async ({ tokenIn, tokenOut, amount }) => {
      try {
        if (!swap) throw new Error('Swap module not initialized')
        if (tokenIn === tokenOut) throw new Error('tokenIn and tokenOut must differ')

        const result = await swap.sell(tokenIn, tokenOut, amount, 2)

        const text = `Swapped ${result.amountIn} ${tokenIn} → ${result.amountOut} ${tokenOut}\nTX: ${result.tx}\nGas used: ${result.gasUsed}`

        return {
          content: [{ type: 'text', text }],
          structuredContent: result
        }
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${e.message}` }] }
      }
    }
  )
}

function tsentryBridgeQuote (server) {
  server.registerTool(
    'tsentry_bridge_quote',
    {
      title: 'Tsentry USDT0 Bridge Quote',
      description: `Get a cross-chain USDT0 bridge quote via LayerZero V2.

Queries REAL mainnet OFT contracts for bridge fees.
Supported chains: ethereum, arbitrum, berachain, ink.

Args:
  - sourceChain (REQUIRED): Source chain
  - targetChain (REQUIRED): Destination chain
  - amount (REQUIRED): USDT0 amount to bridge

Examples:
  - "Quote bridging 100 USDT0 from Ethereum to Arbitrum"
  - "What's the fee to bridge to Berachain?"`,
      inputSchema: z.object({
        sourceChain: z.enum(['ethereum', 'arbitrum', 'berachain', 'ink']).describe('Source chain'),
        targetChain: z.enum(['ethereum', 'arbitrum', 'berachain', 'ink']).describe('Target chain'),
        amount: z.number().positive().describe('USDT0 amount')
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ sourceChain, targetChain, amount }) => {
      try {
        if (!bridge) throw new Error('Bridge module not initialized')

        const quote = await bridge.quote(sourceChain, targetChain, amount)

        const text = `Bridge Quote: ${amount} USDT0 ${quote.sourceChain} → ${quote.targetChain}\nFee: ${quote.nativeFee.toFixed(8)} ${quote.nativeSymbol}\nMin received: ${quote.minReceived} USDT0`

        return {
          content: [{ type: 'text', text }],
          structuredContent: quote
        }
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${e.message}` }] }
      }
    }
  )
}

function tsentryBridgeRoutes (server) {
  server.registerTool(
    'tsentry_bridge_routes',
    {
      title: 'Tsentry Bridge Routes',
      description: `Compare USDT0 bridge fees across all routes from a source chain.

Queries mainnet LayerZero OFT contracts sequentially.
Returns fees for all available destination chains.

Args:
  - sourceChain (REQUIRED): Source chain
  - amount (OPTIONAL): Amount to quote, default 100

Examples:
  - "Compare bridge fees from Ethereum"
  - "What are the cheapest bridge routes from Arbitrum?"`,
      inputSchema: z.object({
        sourceChain: z.enum(['ethereum', 'arbitrum', 'berachain', 'ink']).describe('Source chain'),
        amount: z.number().positive().default(100).describe('USDT0 amount (default 100)')
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ sourceChain, amount }) => {
      try {
        if (!bridge) throw new Error('Bridge module not initialized')

        const quotes = await bridge.quoteAllRoutes(sourceChain, amount || 100)

        if (!quotes.length) return { content: [{ type: 'text', text: 'No routes available' }] }

        const text = [
          `Bridge Routes from ${sourceChain} (${amount || 100} USDT0):`,
          ...quotes.map(q => `  → ${q.targetChain}: ${q.nativeFee.toFixed(8)} ${q.nativeSymbol}`)
        ].join('\n')

        return {
          content: [{ type: 'text', text }],
          structuredContent: { sourceChain, amount: amount || 100, routes: quotes }
        }
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${e.message}` }] }
      }
    }
  )
}

function tsentrySupply (server) {
  server.registerTool(
    'tsentry_supply',
    {
      title: 'Tsentry Supply to Aave',
      description: `Supply tokens to Aave V3 lending pool on Sepolia.

This is a WRITE operation — tokens will be deposited into Aave.
Supports: USDT, DAI, USDC, WETH.

Note: Stablecoin supply caps on Sepolia may be exceeded.
WETH has no cap and is recommended.

Args:
  - token (REQUIRED): Token to supply
  - amount (REQUIRED): Amount to supply

Examples:
  - "Supply 0.005 WETH to Aave"
  - "Deposit 100 USDT into lending"`,
      inputSchema: z.object({
        token: z.enum(['USDT', 'DAI', 'USDC', 'WETH']).describe('Token to supply'),
        amount: z.number().positive().describe('Amount to supply')
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
    },
    async ({ token, amount }) => {
      try {
        if (!aave) throw new Error('Aave module not initialized')

        const result = await aave.supply(token, amount)

        const text = `Supplied ${amount} ${token} to Aave V3\nTX: ${result.tx}\nGas used: ${result.gasUsed}`

        return {
          content: [{ type: 'text', text }],
          structuredContent: result
        }
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${e.message}` }] }
      }
    }
  )
}

function tsentryWithdraw (server) {
  server.registerTool(
    'tsentry_withdraw',
    {
      title: 'Tsentry Withdraw from Aave',
      description: `Withdraw tokens from Aave V3 lending pool on Sepolia.

This is a WRITE operation — tokens will be returned to your wallet.

Args:
  - token (REQUIRED): Token to withdraw
  - amount (REQUIRED): Amount to withdraw (use -1 for max)

Examples:
  - "Withdraw all WETH from Aave"
  - "Take out 50 USDC from lending"`,
      inputSchema: z.object({
        token: z.enum(['USDT', 'DAI', 'USDC', 'WETH']).describe('Token to withdraw'),
        amount: z.number().describe('Amount to withdraw (-1 for max)')
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
    },
    async ({ token, amount }) => {
      try {
        if (!aave) throw new Error('Aave module not initialized')

        const result = await aave.withdraw(token, amount === -1 ? Infinity : amount)

        const text = `Withdrawn ${amount === -1 ? 'max' : amount} ${token} from Aave V3\nTX: ${result.tx}\nGas used: ${result.gasUsed}`

        return {
          content: [{ type: 'text', text }],
          structuredContent: result
        }
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${e.message}` }] }
      }
    }
  )
}

function tsentryOverview (server) {
  server.registerTool(
    'tsentry_overview',
    {
      title: 'Tsentry System Overview',
      description: `Get a complete overview of the Tsentry autonomous treasury agent.

Returns: supported tokens, available swap pairs, bridge chains, Aave pool config,
and current system capabilities. This is a read-only operation.

Examples:
  - "What can Tsentry do?"
  - "Show me the system overview"
  - "What chains and tokens are supported?"`,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async () => {
      try {
        const info = {
          name: 'Tsentry',
          version: '0.1.0',
          description: 'Autonomous Multi-Chain Treasury Agent powered by Tether WDK',
          network: 'Sepolia Testnet',
          wallet: wallet?.address || 'Not configured',
          capabilities: {
            wallet: 'ETH + ERC20 balances, transfers, wrap/unwrap WETH',
            lending: 'Aave V3 — supply, withdraw, borrow, repay',
            swap: 'Uniswap V3 — 6 token pairs, 3 fee tiers',
            bridge: 'USDT0 LayerZero — 4 chains (Ethereum, Arbitrum, Berachain, Ink)',
            pricing: 'CoinGecko + Bitfinex live prices'
          },
          tokens: ['ETH', 'USDT', 'DAI', 'USDC', 'WETH'],
          aavePool: process.env.AAVE_POOL || 'Not configured',
          bridgeChains: bridge?.getSupportedChains().map(c => c.name) || [],
          swapPairs: swap ? (await swap.getAvailablePairs()).map(p => `${p.tokenA}/${p.tokenB}`) : []
        }

        const text = [
          'Tsentry — Autonomous Multi-Chain Treasury Agent',
          `Network: ${info.network}`,
          `Wallet: ${info.wallet}`,
          '',
          'Capabilities:',
          ...Object.entries(info.capabilities).map(([k, v]) => `  ${k}: ${v}`),
          '',
          `Tokens: ${info.tokens.join(', ')}`,
          `Swap Pairs: ${info.swapPairs.join(', ') || 'Discovering...'}`,
          `Bridge Chains: ${info.bridgeChains.join(', ')}`,
          '',
          'Available MCP Tools:',
          '  WDK: getBalance, getAddress, transfer, swap, bridge, supply, withdraw, borrow, repay, pricing',
          '  Tsentry: tsentry_portfolio, tsentry_overview, tsentry_swap_quote, tsentry_swap_execute,',
          '           tsentry_bridge_quote, tsentry_bridge_routes, tsentry_supply, tsentry_withdraw'
        ].join('\n')

        return {
          content: [{ type: 'text', text }],
          structuredContent: info
        }
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: `Error: ${e.message}` }] }
      }
    }
  )
}

// ─── AI Reasoning Tool ───

let llm = null
if (process.env.ANTHROPIC_API_KEY) {
  try { llm = new LlmReasoning() } catch { llm = null }
}

function tsentryAskAi (server) {
  server.registerTool(
    'tsentry_ask_ai',
    {
      title: 'Tsentry AI Analysis',
      description: `Ask the AI reasoning engine to analyze the current treasury state and propose actions.

Provide an optional instruction to focus the analysis (e.g., "Should I increase lending?",
"Analyze risk exposure", "What's the best strategy for USDT yield?").

Returns: AI reasoning, market assessment, risk level, proposed actions with confidence scores.

Examples:
  - "Analyze my portfolio"
  - "Should I rebalance?"
  - "What are the risks right now?"`,
      inputSchema: z.object({
        instruction: z.string().optional().describe('Optional focus instruction for the AI analysis')
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true }
    },
    async ({ instruction }) => {
      try {
        if (!llm) {
          return { content: [{ type: 'text', text: 'LLM not available — set ANTHROPIC_API_KEY in .env' }] }
        }

        const balances = await wallet.getAllBalances()
        const supplied = await aave.getAllSupplied()
        const prices = await getPrices(['ETH', 'BTC', 'USDT', 'DAI', 'USDC'])
        const pairs = await swap.getAvailablePairs()

        const snapshot = {
          cycle: 0,
          strategy: { name: 'Balanced', allocations: { lending: 40, liquidity: 30, reserve: 30 }, targetYield: 6, maxRisk: 40, rebalanceThreshold: 5 },
          active: false, paused: false,
          balances, supplied,
          aaveAccount: await aave.getAccountData(),
          portfolio: { totalUSD: Object.values(balances).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0) },
          prices,
          lendingPct: '0',
          swapPairs: pairs,
          bridgeChains: bridge?.getSupportedChains() || [],
          recentActions: [],
          recentErrors: []
        }

        const decision = await llm.reason(snapshot, { userInstruction: instruction })

        const lines = [
          `AI Analysis (${decision._meta?.model || 'unknown'}, ${decision._meta?.latencyMs || '?'}ms)`,
          '',
          `Reasoning: ${decision.reasoning}`,
          `Market: ${decision.market_assessment} | Risk: ${decision.risk_level}`,
          ''
        ]

        if (decision.actions.length > 0) {
          lines.push('Proposed Actions:')
          for (const a of decision.actions) {
            lines.push(`  [${a.type}] ${a.token || ''} ${a.amount || ''} — ${a.reason} (confidence: ${((a.confidence || 0) * 100).toFixed(0)}%)`)
          }
        } else {
          lines.push('No actions proposed — current position looks good.')
        }

        if (decision.next_check_suggestion) {
          lines.push(`\nSuggested next check: ${decision.next_check_suggestion}`)
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          structuredContent: decision
        }
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: `AI reasoning error: ${e.message}` }] }
      }
    }
  )
}

// ─── Register All Tools ───

const tools = [
  // WDK built-in tools
  ...WALLET_TOOLS,
  ...SWAP_TOOLS,
  ...BRIDGE_TOOLS,
  ...LENDING_TOOLS,
  ...PRICING_TOOLS,
  ...FIAT_TOOLS,

  // Custom Tsentry tools
  tsentryPortfolio,
  tsentrySwapQuote,
  tsentrySwapExecute,
  tsentryBridgeQuote,
  tsentryBridgeRoutes,
  tsentrySupply,
  tsentryWithdraw,
  tsentryOverview,
  tsentryAskAi
]

server.registerTools(tools)

// ─── Start Transport ───

const transport = new StdioServerTransport()
await server.connect(transport)

console.error('[tsentry-mcp] Server running on stdio')
console.error(`[tsentry-mcp] Chains: ${server.getChains().join(', ')}`)
console.error(`[tsentry-mcp] Tokens: ${server.getRegisteredTokens('ethereum').join(', ')}`)
console.error(`[tsentry-mcp] Custom tools: 9 Tsentry + ${WALLET_TOOLS.length + SWAP_TOOLS.length + BRIDGE_TOOLS.length + LENDING_TOOLS.length + PRICING_TOOLS.length + FIAT_TOOLS.length} WDK`)
