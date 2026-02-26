// Tsentry — Price Feed Module
// Fetches live prices from public APIs (no API key needed)

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

const COIN_IDS = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai',
  SOL: 'solana',
  AAVE: 'aave'
}

/**
 * Fetch current prices for multiple assets
 * @param {string[]} symbols - e.g. ['ETH', 'BTC']
 * @returns {object} { ETH: 2650.12, BTC: 95000, ... }
 */
export async function getPrices (symbols = ['ETH', 'BTC', 'USDT']) {
  const ids = symbols
    .map(s => COIN_IDS[s.toUpperCase()])
    .filter(Boolean)
    .join(',')

  try {
    const res = await fetch(
      `${COINGECKO_BASE}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
    )
    if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`)
    const data = await res.json()

    const result = {}
    for (const sym of symbols) {
      const id = COIN_IDS[sym.toUpperCase()]
      if (id && data[id]) {
        result[sym] = {
          usd: data[id].usd,
          change24h: data[id].usd_24h_change || 0
        }
      }
    }
    return result
  } catch (e) {
    // Fallback: return stale/hardcoded for stablecoins
    const fallback = {}
    for (const sym of symbols) {
      if (['USDT', 'USDC', 'DAI'].includes(sym.toUpperCase())) {
        fallback[sym] = { usd: 1.0, change24h: 0 }
      }
    }
    fallback._error = e.message
    return fallback
  }
}

/**
 * Get price for a single asset
 * @param {string} symbol
 * @returns {number} USD price
 */
export async function getPrice (symbol) {
  const prices = await getPrices([symbol])
  return prices[symbol]?.usd ?? null
}

/**
 * Calculate portfolio value in USD
 * @param {object} balances - { ETH: 0.5, USDT: 1000, ... }
 * @returns {object} { items: [...], totalUSD: number }
 */
export async function calculatePortfolioValue (balances) {
  const symbols = Object.keys(balances).filter(s => balances[s] > 0)
  const prices = await getPrices(symbols)

  const items = []
  let totalUSD = 0

  for (const sym of symbols) {
    const amount = balances[sym]
    const price = prices[sym]?.usd ?? (
      ['USDT', 'USDC', 'DAI'].includes(sym) ? 1.0 : 0
    )
    const value = amount * price
    totalUSD += value
    items.push({
      symbol: sym,
      amount,
      priceUSD: price,
      valueUSD: value,
      change24h: prices[sym]?.change24h ?? 0
    })
  }

  items.sort((a, b) => b.valueUSD - a.valueUSD)
  return { items, totalUSD }
}
