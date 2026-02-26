// Tsentry — EVM Wallet Module
// Direct ethers.js wallet operations for Sepolia testnet

import { ethers } from 'ethers'

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)'
]

export class EvmWallet {
  /**
   * @param {object} config
   * @param {string} config.privateKey
   * @param {string} config.rpcUrl
   * @param {object} config.tokens - { symbol: { address, decimals } }
   */
  constructor (config) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl)
    this.signer = new ethers.Wallet(config.privateKey, this.provider)
    this.address = this.signer.address
    this.tokens = config.tokens || {}
    this._contracts = {}
  }

  /** Get or create an ERC20 contract instance */
  _token (symbol) {
    if (!this._contracts[symbol]) {
      const info = this.tokens[symbol]
      if (!info) throw new Error(`Unknown token: ${symbol}`)
      this._contracts[symbol] = new ethers.Contract(info.address, ERC20_ABI, this.signer)
    }
    return this._contracts[symbol]
  }

  /** Get ETH balance in ether */
  async getEthBalance () {
    const bal = await this.provider.getBalance(this.address)
    return parseFloat(ethers.formatEther(bal))
  }

  /** Get token balance (human-readable) */
  async getTokenBalance (symbol) {
    const contract = this._token(symbol)
    const bal = await contract.balanceOf(this.address)
    return parseFloat(ethers.formatUnits(bal, this.tokens[symbol].decimals))
  }

  /** Get all balances at once */
  async getAllBalances () {
    const result = { ETH: await this.getEthBalance() }
    for (const symbol of Object.keys(this.tokens)) {
      try {
        result[symbol] = await this.getTokenBalance(symbol)
      } catch {
        result[symbol] = 0
      }
    }
    return result
  }

  /** Approve a spender for a token amount */
  async approve (symbol, spender, amount) {
    const contract = this._token(symbol)
    const decimals = this.tokens[symbol].decimals
    const parsed = ethers.parseUnits(amount.toString(), decimals)
    const tx = await contract.approve(spender, parsed)
    return tx.wait()
  }

  /** Check allowance */
  async getAllowance (symbol, spender) {
    const contract = this._token(symbol)
    const allowance = await contract.allowance(this.address, spender)
    return parseFloat(ethers.formatUnits(allowance, this.tokens[symbol].decimals))
  }

  /** Transfer token to address */
  async transfer (symbol, to, amount) {
    const contract = this._token(symbol)
    const decimals = this.tokens[symbol].decimals
    const parsed = ethers.parseUnits(amount.toString(), decimals)
    const tx = await contract.transfer(to, parsed)
    return tx.wait()
  }

  /** Wrap ETH to WETH */
  async wrapEth (amountEth) {
    const wethInfo = this.tokens.WETH
    if (!wethInfo) throw new Error('WETH token not configured')
    const weth = new ethers.Contract(wethInfo.address, [
      'function deposit() payable',
      'function withdraw(uint256)'
    ], this.signer)
    const tx = await weth.deposit({ value: ethers.parseEther(amountEth.toString()) })
    return tx.wait()
  }

  /** Unwrap WETH to ETH */
  async unwrapWeth (amount) {
    const wethInfo = this.tokens.WETH
    if (!wethInfo) throw new Error('WETH token not configured')
    const weth = new ethers.Contract(wethInfo.address, [
      'function withdraw(uint256)'
    ], this.signer)
    const tx = await weth.withdraw(ethers.parseEther(amount.toString()))
    return tx.wait()
  }

  /** Get current gas price */
  async getGasPrice () {
    const feeData = await this.provider.getFeeData()
    return {
      gasPrice: parseFloat(ethers.formatUnits(feeData.gasPrice || 0n, 'gwei')),
      maxFeePerGas: feeData.maxFeePerGas ? parseFloat(ethers.formatUnits(feeData.maxFeePerGas, 'gwei')) : null
    }
  }

  /** Get current block number */
  async getBlockNumber () {
    return this.provider.getBlockNumber()
  }
}

/** Create wallet from env vars */
export function createWalletFromEnv () {
  return new EvmWallet({
    privateKey: process.env.ETH_PRIVATE_KEY,
    rpcUrl: process.env.ETH_RPC_URL || 'https://sepolia.drpc.org',
    tokens: {
      USDT: { address: process.env.USDT_CONTRACT, decimals: 6 },
      DAI: { address: process.env.DAI_CONTRACT, decimals: 18 },
      USDC: { address: process.env.USDC_CONTRACT, decimals: 6 },
      WETH: { address: process.env.WETH_CONTRACT, decimals: 18 }
    }
  })
}
