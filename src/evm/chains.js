// Tsentry — Multi-chain Configuration
// Pre-configured chain settings for supported networks

export const CHAINS = {
  // ─── Testnets ───
  sepolia: {
    name: 'Sepolia',
    chainId: 11155111,
    rpcUrl: 'https://sepolia.drpc.org',
    explorer: 'https://sepolia.etherscan.io',
    type: 'testnet',
    tokens: {
      USDT: { address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0', decimals: 6 },
      DAI: { address: '0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357', decimals: 18 },
      USDC: { address: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8', decimals: 6 },
      WETH: { address: '0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c', decimals: 18 }
    },
    aave: {
      pool: '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951',
      faucet: '0xC959483DBa39aa9E78757139af0e9a2EDEb3f42D'
    },
    swap: 'uniswap', // Velora not available on testnets
    x402: null // USDT0 not deployed on testnets
  },

  // ─── Mainnets ───
  arbitrum: {
    name: 'Arbitrum One',
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorer: 'https://arbiscan.io',
    type: 'mainnet',
    tokens: {
      USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
      USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
      'USDC.e': { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals: 6 },
      WETH: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
      DAI: { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18 },
      USDT0: { address: '0x3b3a2A1e12CE692F7e395b3e8b92e1FC9E5e3e0A', decimals: 6 }
    },
    aave: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD'
    },
    swap: 'velora',
    x402: {
      network: 'eip155:42161',
      tokenAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
    }
  },

  ethereum: {
    name: 'Ethereum Mainnet',
    chainId: 1,
    rpcUrl: 'https://eth.drpc.org',
    explorer: 'https://etherscan.io',
    type: 'mainnet',
    tokens: {
      USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
      USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
      WETH: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
      DAI: { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 },
      USDT0: { address: '0x3b3a2A1e12CE692F7e395b3e8b92e1FC9E5e3e0A', decimals: 6 }
    },
    aave: {
      pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2'
    },
    swap: 'velora',
    x402: {
      network: 'eip155:1',
      tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
    }
  },

  base: {
    name: 'Base',
    chainId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    type: 'mainnet',
    tokens: {
      USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
      WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
      DAI: { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18 }
    },
    aave: {
      pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'
    },
    swap: 'velora',
    x402: null
  }
}

/**
 * Resolve chain config from env vars or chain name
 * @param {string} [chainName] - Chain name override (default: auto-detect from ETH_RPC_URL)
 * @returns {object} Chain configuration
 */
export function resolveChainConfig (chainName) {
  // Explicit chain name
  if (chainName && CHAINS[chainName]) {
    return { ...CHAINS[chainName] }
  }

  // Default to sepolia (testnet) for safety
  return { ...CHAINS.sepolia }
}

/**
 * Get chain config by chain ID
 * @param {number} chainId
 * @returns {object|null} Chain configuration
 */
export function getChainById (chainId) {
  for (const config of Object.values(CHAINS)) {
    if (config.chainId === chainId) return { ...config }
  }
  return null
}
