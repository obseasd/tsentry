// Tsentry — Input Validation Helpers

export const VALID_TOKENS = ['ETH', 'WETH', 'USDT', 'USDC', 'DAI', 'USDT0', 'USDC.e']
export const VALID_STRATEGIES = ['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE', 'USDT_YIELD', 'TETHER_DIVERSIFIED']
export const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
export const CHAIN_NAME_RE = /^[a-zA-Z0-9_-]{1,30}$/

export function validateToken (token) {
  if (!token || typeof token !== 'string') return 'token is required'
  if (!VALID_TOKENS.includes(token)) return `invalid token: ${token}`
  return null
}

export function validateAmount (amount) {
  if (amount === 'max') return null
  const n = Number(amount)
  if (!amount || isNaN(n) || n <= 0 || n > 1e12) return 'amount must be a positive number'
  return null
}

export function validateAddress (addr) {
  if (!addr || typeof addr !== 'string') return 'address is required'
  if (!ETH_ADDRESS_RE.test(addr)) return 'invalid Ethereum address'
  return null
}

export function validateChain (chain) {
  if (!chain || typeof chain !== 'string') return 'chain name is required'
  if (!CHAIN_NAME_RE.test(chain)) return 'invalid chain name'
  return null
}
