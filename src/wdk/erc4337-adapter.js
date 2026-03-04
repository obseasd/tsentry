// Tsentry — ERC-4337 Account Abstraction Adapter
// Wraps @tetherto/wdk-wallet-evm-erc-4337 for Smart Account capabilities
// Enables: gasless transactions (pay fees in USDT), batched operations, session keys
//
// Architecture: EOA wallet (for Aave/direct DeFi) + Smart Account (for gasless ops)
// The ERC-4337 account is a Safe smart contract wallet predicted from the EOA owner

import WalletManagerEvmErc4337 from '@tetherto/wdk-wallet-evm-erc-4337'

// EntryPoint v0.7 (standard across EVM chains)
const DEFAULT_ENTRYPOINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'
const DEFAULT_SAFE_MODULES_VERSION = '0.3.0'

export class Erc4337Adapter {
  /**
   * @param {object} config
   * @param {string} config.seed - BIP-39 mnemonic
   * @param {string} config.rpcUrl - JSON-RPC provider URL
   * @param {number} config.chainId - Target chain ID
   * @param {string} config.bundlerUrl - ERC-4337 bundler endpoint (e.g. Pimlico)
   * @param {object} [config.paymaster] - Paymaster config for gasless mode
   * @param {string} [config.paymaster.url] - Paymaster service URL
   * @param {string} [config.paymaster.address] - Paymaster contract address
   * @param {string} [config.paymaster.tokenAddress] - ERC-20 token to pay gas (e.g. USDT)
   */
  constructor (config) {
    this.seed = config.seed
    this.rpcUrl = config.rpcUrl
    this.chainId = config.chainId
    this.bundlerUrl = config.bundlerUrl
    this.paymasterConfig = config.paymaster || null

    this.manager = null
    this.account = null // WalletAccountEvmErc4337
    this.smartAddress = null // Safe contract address
    this.mode = 'native' // 'native' | 'paymaster' | 'sponsored'
  }

  /** Initialize the ERC-4337 smart account */
  async init () {
    // Determine gas payment mode
    const walletConfig = {
      chainId: this.chainId,
      provider: this.rpcUrl,
      bundlerUrl: this.bundlerUrl,
      entryPointAddress: process.env.ERC4337_ENTRYPOINT || DEFAULT_ENTRYPOINT,
      safeModulesVersion: DEFAULT_SAFE_MODULES_VERSION
    }

    if (this.paymasterConfig?.url && this.paymasterConfig?.address && this.paymasterConfig?.tokenAddress) {
      // Paymaster mode: gas paid in ERC-20 token (e.g. USDT)
      walletConfig.paymasterUrl = this.paymasterConfig.url
      walletConfig.paymasterAddress = this.paymasterConfig.address
      walletConfig.paymasterToken = { address: this.paymasterConfig.tokenAddress }
      this.mode = 'paymaster'
    } else if (this.paymasterConfig?.url && !this.paymasterConfig?.address) {
      // Sponsored mode: paymaster sponsors all gas
      walletConfig.isSponsored = true
      walletConfig.paymasterUrl = this.paymasterConfig.url
      if (this.paymasterConfig.policyId) {
        walletConfig.sponsorshipPolicyId = this.paymasterConfig.policyId
      }
      this.mode = 'sponsored'
    } else {
      // Native coins mode: gas paid in ETH (simplest)
      walletConfig.useNativeCoins = true
      this.mode = 'native'
    }

    this.manager = new WalletManagerEvmErc4337(this.seed, walletConfig)
    this.account = await this.manager.getAccount(0)
    this.smartAddress = await this.account.getAddress()

    return this
  }

  /**
   * Quote a transfer fee (gasless estimation)
   * @param {string} tokenAddress - ERC-20 token contract
   * @param {string} to - Recipient address
   * @param {bigint} amount - Amount in base units
   * @returns {object} { fee, feeToken }
   */
  async quoteTransfer (tokenAddress, to, amount) {
    const result = await this.account.quoteTransfer({
      token: tokenAddress,
      to,
      amount
    })

    return {
      fee: result.fee,
      feeToken: this.mode === 'paymaster' ? 'USDT' : 'ETH',
      mode: this.mode
    }
  }

  /**
   * Execute a gasless transfer via Smart Account
   * @param {string} tokenAddress - ERC-20 token contract
   * @param {string} to - Recipient
   * @param {bigint} amount - Amount in base units
   * @returns {object} { hash, fee }
   */
  async transfer (tokenAddress, to, amount) {
    return this.account.transfer({
      token: tokenAddress,
      to,
      amount
    })
  }

  /**
   * Send batched transactions in a single UserOperation
   * @param {Array<{to: string, value: bigint, data?: string}>} txs
   * @returns {object} { hash, fee }
   */
  async batchSend (txs) {
    return this.account.sendTransaction(txs)
  }

  /**
   * Quote fee for a batch of transactions
   * @param {Array<{to: string, value: bigint, data?: string}>} txs
   * @returns {object} { fee }
   */
  async quoteBatch (txs) {
    return this.account.quoteSendTransaction(txs)
  }

  /**
   * Approve token spending via Smart Account
   * @param {string} tokenAddress - Token to approve
   * @param {string} spender - Spender address
   * @param {bigint} amount - Amount to approve
   * @returns {object} { hash, fee }
   */
  async approve (tokenAddress, spender, amount) {
    return this.account.approve({
      token: tokenAddress,
      spender,
      amount
    })
  }

  /** Get ETH balance of the Smart Account */
  async getBalance () {
    return this.account.getBalance()
  }

  /** Get ERC-20 token balance of the Smart Account */
  async getTokenBalance (tokenAddress) {
    return this.account.getTokenBalance(tokenAddress)
  }

  /** Get paymaster token balance (only in paymaster mode) */
  async getPaymasterTokenBalance () {
    if (this.mode !== 'paymaster') return null
    return this.account.getPaymasterTokenBalance()
  }

  /** Get UserOperation receipt */
  async getUserOpReceipt (hash) {
    return this.account.getUserOperationReceipt(hash)
  }

  /** Get info for dashboard/snapshot */
  getInfo () {
    return {
      enabled: true,
      smartAddress: this.smartAddress,
      mode: this.mode,
      chainId: this.chainId,
      bundlerUrl: this.bundlerUrl?.replace(/apikey=[^&]+/, 'apikey=***'),
      entryPoint: process.env.ERC4337_ENTRYPOINT || DEFAULT_ENTRYPOINT,
      features: [
        'gasless_transfers',
        'batched_transactions',
        this.mode === 'paymaster' ? 'usdt_gas_payment' : null,
        this.mode === 'sponsored' ? 'sponsored_gas' : null
      ].filter(Boolean)
    }
  }

  /** Clean up */
  dispose () {
    if (this.account?.dispose) this.account.dispose()
  }
}

/**
 * Create ERC-4337 adapter from env vars (optional — returns null if not configured)
 * Env vars:
 *   ERC4337_BUNDLER_URL — Required (e.g. https://api.pimlico.io/v2/sepolia/rpc?apikey=...)
 *   ERC4337_ENTRYPOINT — Optional (defaults to v0.7 standard)
 *   ERC4337_PAYMASTER_URL — Optional (enables paymaster mode)
 *   ERC4337_PAYMASTER_ADDRESS — Optional (paymaster contract)
 *   ERC4337_PAYMASTER_TOKEN — Optional (token to pay gas, e.g. USDT address)
 * @param {string} seed - BIP-39 mnemonic
 * @param {string} rpcUrl - RPC endpoint
 * @param {number} chainId - Chain ID
 * @returns {Promise<Erc4337Adapter|null>}
 */
export async function createErc4337Adapter (seed, rpcUrl, chainId) {
  const bundlerUrl = process.env.ERC4337_BUNDLER_URL
  if (!bundlerUrl) return null

  const paymaster = process.env.ERC4337_PAYMASTER_URL
    ? {
        url: process.env.ERC4337_PAYMASTER_URL,
        address: process.env.ERC4337_PAYMASTER_ADDRESS,
        tokenAddress: process.env.ERC4337_PAYMASTER_TOKEN,
        policyId: process.env.ERC4337_SPONSORSHIP_POLICY
      }
    : null

  const adapter = new Erc4337Adapter({
    seed,
    rpcUrl,
    chainId,
    bundlerUrl,
    paymaster
  })

  await adapter.init()
  return adapter
}
