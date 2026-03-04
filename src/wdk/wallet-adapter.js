// Tsentry — WDK Wallet Adapter
// Primary wallet layer using Tether WDK, with ethers.js signer derived for DeFi compatibility

import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import { ethers } from 'ethers'
import { createErc4337Adapter } from './erc4337-adapter.js'

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)'
]

/**
 * WdkWalletAdapter — wraps @tetherto/wdk-wallet-evm as the primary wallet
 *
 * - Uses WDK for: wallet creation from seed, balance queries, transfers, signing
 * - Derives ethers.js signer from WDK's keyPair for Aave/Uniswap contract calls
 * - Single source of truth: seed phrase → WDK → derived signer
 */
export class WdkWalletAdapter {
  constructor (config = {}) {
    this.seed = config.seed || process.env.WDK_SEED
    this.rpcUrl = config.rpcUrl || process.env.ETH_RPC_URL || 'https://sepolia.drpc.org'
    this.accountIndex = config.accountIndex || 0
    this.tokens = config.tokens || {}

    // WDK objects
    this.wdkManager = null
    this.wdkAccount = null

    // ERC-4337 Smart Account (optional — gasless transactions)
    this.erc4337 = null

    // Derived ethers.js objects (for DeFi contract compatibility)
    this.provider = null
    this.signer = null
    this.address = null

    this._contracts = {}
  }

  /**
   * Initialize WDK wallet and derive ethers.js signer
   * @returns {WdkWalletAdapter} this
   */
  async init () {
    if (!this.seed) {
      throw new Error('WDK seed required — set WDK_SEED env variable or pass seed option')
    }

    // 1. Create WDK wallet manager from seed
    this.wdkManager = new WalletManagerEvm(this.seed, {
      provider: this.rpcUrl
    })

    // 2. Get WDK account (BIP-44 derivation)
    this.wdkAccount = await this.wdkManager.getAccount(this.accountIndex)
    this.address = this.wdkAccount.address

    // 3. Derive ethers.js signer from WDK's key pair
    // WDK exposes keyPair.privateKey as Uint8Array — convert to hex for ethers
    const keyPair = this.wdkAccount.keyPair
    const privateKeyHex = '0x' + Buffer.from(keyPair.privateKey).toString('hex')

    this.provider = new ethers.JsonRpcProvider(this.rpcUrl)
    this.signer = new ethers.Wallet(privateKeyHex, this.provider)

    // Verify addresses match (WDK and ethers should derive the same address)
    if (this.signer.address.toLowerCase() !== this.address.toLowerCase()) {
      throw new Error(
        `Address mismatch: WDK=${this.address} vs ethers=${this.signer.address}. ` +
        'This should not happen — check seed/derivation path.'
      )
    }

    // ERC-4337 Account Abstraction (optional — activated by ERC4337_BUNDLER_URL)
    // Creates a Safe smart contract wallet for gasless transactions + batched ops
    if (process.env.ERC4337_BUNDLER_URL) {
      try {
        const network = await this.provider.getNetwork()
        this.erc4337 = await createErc4337Adapter(
          this.seed, this.rpcUrl, Number(network.chainId)
        )
      } catch (e) {
        // Non-fatal — ERC-4337 is an enhancement, not required
        console.log(`[wdk] ERC-4337 init failed: ${e.message} — continuing without smart account`)
        this.erc4337 = null
      }
    }

    return this
  }

  // ─── WDK Native Methods ───

  /** Get ETH balance via WDK (returns wei as bigint) */
  async getEthBalanceWei () {
    return this.wdkAccount.getBalance()
  }

  /** Get ETH balance (human-readable) */
  async getEthBalance () {
    const wei = await this.wdkAccount.getBalance()
    return parseFloat(ethers.formatEther(wei))
  }

  /** Get ERC20 token balance via WDK */
  async getTokenBalanceWdk (tokenAddress) {
    return this.wdkAccount.getTokenBalance(tokenAddress)
  }

  /** Transfer ERC20 token via WDK */
  async transferWdk (tokenAddress, to, amount) {
    return this.wdkAccount.transfer({
      token: tokenAddress,
      to,
      amount: amount.toString()
    })
  }

  /** Sign a message via WDK */
  async sign (message) {
    return this.wdkAccount.sign(message)
  }

  /** Sign typed data (EIP-712) via WDK */
  async signTypedData (typedData) {
    return this.wdkAccount.signTypedData(typedData)
  }

  /** Get fee rates via WDK */
  async getFeeRates () {
    return this.wdkManager.getFeeRates()
  }

  // ─── Ethers.js Compatible Methods (for Aave/Uniswap) ───

  /** Get or create an ERC20 contract instance via ethers.js signer */
  _token (symbol) {
    if (!this._contracts[symbol]) {
      const info = this.tokens[symbol]
      if (!info) throw new Error(`Unknown token: ${symbol}`)
      this._contracts[symbol] = new ethers.Contract(info.address, ERC20_ABI, this.signer)
    }
    return this._contracts[symbol]
  }

  /** Get token balance (human-readable) */
  async getTokenBalance (symbol) {
    const contract = this._token(symbol)
    const bal = await contract.balanceOf(this.address)
    return parseFloat(ethers.formatUnits(bal, this.tokens[symbol].decimals))
  }

  /** Get all balances */
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

  /** Approve a spender */
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

  /** Transfer token */
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

  /** Get gas price */
  async getGasPrice () {
    const feeData = await this.provider.getFeeData()
    return {
      gasPrice: parseFloat(ethers.formatUnits(feeData.gasPrice || 0n, 'gwei')),
      maxFeePerGas: feeData.maxFeePerGas ? parseFloat(ethers.formatUnits(feeData.maxFeePerGas, 'gwei')) : null
    }
  }

  /** Get WDK wallet info (for dashboard/snapshot) */
  getInfo () {
    return {
      source: 'wdk',
      seed: 'BIP-39 (WDK_SEED)',
      derivationPath: `m/44'/60'/${this.accountIndex}'/0/0`,
      address: this.address,
      rpcUrl: this.rpcUrl,
      tokenCount: Object.keys(this.tokens).length,
      erc4337: this.erc4337 ? this.erc4337.getInfo() : { enabled: false }
    }
  }

  /** Clean up WDK account (security — erase key from memory) */
  dispose () {
    if (this.wdkAccount?.dispose) {
      this.wdkAccount.dispose()
    }
  }
}

/** Create WDK wallet adapter from env vars */
export async function createWdkWallet () {
  const adapter = new WdkWalletAdapter({
    tokens: {
      USDT: { address: process.env.USDT_CONTRACT, decimals: 6 },
      DAI: { address: process.env.DAI_CONTRACT, decimals: 18 },
      USDC: { address: process.env.USDC_CONTRACT, decimals: 6 },
      WETH: { address: process.env.WETH_CONTRACT, decimals: 18 }
    }
  })
  await adapter.init()
  return adapter
}
