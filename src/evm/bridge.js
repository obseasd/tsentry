// Tsentry — USDT0 Bridge Module (LayerZero V2 OFT)
// Cross-chain USDT0 bridging via LayerZero Omnichain Fungible Token

import { ethers } from 'ethers'

// OFT ABI (from WDK protocol)
const OFT_ABI = [
  'function token() view returns (address)',
  'function send(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) _sendParam, tuple(uint256 nativeFee, uint256 lzTokenFee) _fee, address _refundAddress) payable returns (tuple(bytes32 guid, uint64 nonce, tuple(uint256 nativeFee, uint256 lzTokenFee) fee) msgReceipt, tuple(uint256 amountSentLD, uint256 amountReceivedLD) oftReceipt)',
  'function quoteSend(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) _sendParam, bool _payInLzToken) view returns (tuple(uint256 nativeFee, uint256 lzTokenFee) msgFee)'
]

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)'
]

// USDT0 chain configurations (mainnet — LayerZero V2)
const CHAINS = {
  ethereum: {
    name: 'Ethereum',
    chainId: 1,
    eid: 30101,
    oftContract: '0x6C96dE32CEa08842dcc4058c14d3aaAD7Fa41dee',
    rpc: 'https://eth.drpc.org',
    explorer: 'https://etherscan.io',
    nativeSymbol: 'ETH'
  },
  arbitrum: {
    name: 'Arbitrum',
    chainId: 42161,
    eid: 30110,
    oftContract: '0x14E4A1B13bf7F943c8ff7C51fb60FA964A298D92',
    rpc: 'https://arbitrum.drpc.org',
    explorer: 'https://arbiscan.io',
    nativeSymbol: 'ETH'
  },
  berachain: {
    name: 'Berachain',
    chainId: 80094,
    eid: 30362,
    oftContract: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
    rpc: 'https://rpc.berachain.com',
    explorer: 'https://berascan.com',
    nativeSymbol: 'BERA'
  },
  ink: {
    name: 'Ink',
    chainId: 57073,
    eid: 30339,
    oftContract: '0x0200C29006150606B650577BBE7B6248F58470c1',
    rpc: 'https://rpc-gel.inkonchain.com',
    explorer: 'https://explorer.inkonchain.com',
    nativeSymbol: 'ETH'
  }
}

// Fee tolerance: 0.1% slippage on LayerZero
const FEE_TOLERANCE = 999n

export class Usdt0Bridge {
  /**
   * @param {object} config
   * @param {import('ethers').Wallet} [config.signer] - For executing bridges (optional for quote-only)
   */
  constructor (config = {}) {
    this.signer = config.signer || null
    this.sourceChain = null
    this._providers = {}
    this._tokenAddresses = {} // cache: chain → USDT0 address
  }

  /** Detect source chain from signer's provider */
  async detectSourceChain () {
    if (!this.signer) return null
    const network = await this.signer.provider.getNetwork()
    const chainId = Number(network.chainId)
    for (const [key, chain] of Object.entries(CHAINS)) {
      if (chain.chainId === chainId) {
        this.sourceChain = key
        return key
      }
    }
    return null
  }

  /** Get read-only provider for a chain */
  _getProvider (chain) {
    if (!this._providers[chain]) {
      const cfg = CHAINS[chain]
      if (!cfg) throw new Error(`Unknown chain: ${chain}`)
      this._providers[chain] = new ethers.JsonRpcProvider(cfg.rpc)
    }
    return this._providers[chain]
  }

  /** Get OFT contract (read-only) */
  _getOft (chain) {
    const cfg = CHAINS[chain]
    if (!cfg?.oftContract) throw new Error(`No USDT0 OFT on ${chain}`)
    return new ethers.Contract(cfg.oftContract, OFT_ABI, this._getProvider(chain))
  }

  /** Build OFT send parameters */
  _buildSendParam (targetChain, recipient, amountLD) {
    const target = CHAINS[targetChain]
    if (!target) throw new Error(`Unsupported target: ${targetChain}`)

    return {
      dstEid: target.eid,
      to: ethers.zeroPadValue(recipient, 32),
      amountLD,
      minAmountLD: amountLD * FEE_TOLERANCE / 1000n,
      extraOptions: '0x0003', // Empty LayerZero options
      composeMsg: '0x',
      oftCmd: '0x'
    }
  }

  /** Get all supported chains */
  getSupportedChains () {
    return Object.entries(CHAINS).map(([key, cfg]) => ({
      key,
      name: cfg.name,
      chainId: cfg.chainId,
      eid: cfg.eid,
      nativeSymbol: cfg.nativeSymbol,
      explorer: cfg.explorer
    }))
  }

  /** Get available routes from a source chain */
  getRoutes (sourceChain) {
    return Object.entries(CHAINS)
      .filter(([key]) => key !== sourceChain)
      .map(([key, cfg]) => ({ key, name: cfg.name, eid: cfg.eid }))
  }

  /**
   * Quote bridge fee (read-only — queries mainnet from any machine)
   * @param {string} sourceChain - e.g. 'ethereum'
   * @param {string} targetChain - e.g. 'arbitrum'
   * @param {number} amount - Human-readable (e.g. 100 for 100 USDT0)
   * @param {string} [recipient] - Destination address (defaults to signer)
   * @returns {object}
   */
  async quote (sourceChain, targetChain, amount, recipient) {
    if (sourceChain === targetChain) throw new Error('Source and target must differ')
    if (!CHAINS[sourceChain]) throw new Error(`Unknown source: ${sourceChain}`)
    if (!CHAINS[targetChain]) throw new Error(`Unknown target: ${targetChain}`)

    const addr = recipient || this.signer?.address || ethers.ZeroAddress
    const amountLD = ethers.parseUnits(amount.toString(), 6)
    const sendParam = this._buildSendParam(targetChain, addr, amountLD)
    const oft = this._getOft(sourceChain)

    const { nativeFee, lzTokenFee } = await oft.quoteSend(sendParam, false)
    const src = CHAINS[sourceChain]

    return {
      sourceChain: src.name,
      targetChain: CHAINS[targetChain].name,
      amount,
      nativeFee: parseFloat(ethers.formatEther(nativeFee)),
      nativeFeeRaw: nativeFee.toString(),
      nativeSymbol: src.nativeSymbol,
      minReceived: parseFloat(ethers.formatUnits(amountLD * FEE_TOLERANCE / 1000n, 6)),
      recipient: addr
    }
  }

  /**
   * Quote all routes from a source chain (fan-out)
   * @param {string} sourceChain
   * @param {number} amount
   * @returns {Array<object>}
   */
  async quoteAllRoutes (sourceChain, amount) {
    const routes = this.getRoutes(sourceChain)
    const addr = this.signer?.address || ethers.ZeroAddress
    const results = []

    // Sequential to avoid RPC rate limits
    for (const r of routes) {
      try {
        const q = await this.quote(sourceChain, r.key, amount, addr)
        results.push(q)
      } catch { /* skip failed routes */ }
    }

    return results
  }

  /**
   * Execute bridge (must be connected to source chain)
   * @param {string} targetChain
   * @param {number} amount
   * @param {string} [recipient] - defaults to signer address
   * @returns {object}
   */
  async bridge (targetChain, amount, recipient) {
    if (!this.signer) throw new Error('Signer required for bridge execution')

    if (!this.sourceChain) await this.detectSourceChain()
    if (!this.sourceChain) throw new Error('Signer not on a supported USDT0 chain')
    if (this.sourceChain === targetChain) throw new Error('Cannot bridge to same chain')

    const src = CHAINS[this.sourceChain]
    const recipientAddr = recipient || this.signer.address
    const amountLD = ethers.parseUnits(amount.toString(), 6)
    const sendParam = this._buildSendParam(targetChain, recipientAddr, amountLD)

    // OFT contract with signer
    const oft = new ethers.Contract(src.oftContract, OFT_ABI, this.signer)

    // Get underlying USDT0 token address
    if (!this._tokenAddresses[this.sourceChain]) {
      this._tokenAddresses[this.sourceChain] = await oft.token()
    }
    const tokenAddr = this._tokenAddresses[this.sourceChain]

    // Approve OFT to spend USDT0
    const erc20 = new ethers.Contract(tokenAddr, ERC20_ABI, this.signer)
    const allowance = await erc20.allowance(this.signer.address, src.oftContract)
    if (allowance < amountLD) {
      const appTx = await erc20.approve(src.oftContract, ethers.MaxUint256)
      await appTx.wait()
    }

    // Quote bridge fee
    const { nativeFee } = await oft.quoteSend(sendParam, false)
    const fee = { nativeFee, lzTokenFee: 0n }

    // Execute (payable — nativeFee sent as msg.value)
    const tx = await oft.send(sendParam, fee, this.signer.address, { value: nativeFee })
    const receipt = await tx.wait()

    return {
      tx: tx.hash,
      sourceChain: src.name,
      targetChain: CHAINS[targetChain].name,
      amount,
      nativeFee: parseFloat(ethers.formatEther(nativeFee)),
      nativeSymbol: src.nativeSymbol,
      gasUsed: receipt.gasUsed.toString(),
      recipient: recipientAddr,
      explorerUrl: `${src.explorer}/tx/${tx.hash}`
    }
  }

  /**
   * Get USDT0 balance on a specific chain
   * @param {string} chain
   * @param {string} address
   * @returns {number}
   */
  async getBalance (chain, address) {
    const oft = this._getOft(chain)
    if (!this._tokenAddresses[chain]) {
      this._tokenAddresses[chain] = await oft.token()
    }
    const provider = this._getProvider(chain)
    const erc20 = new ethers.Contract(this._tokenAddresses[chain], ERC20_ABI, provider)
    const bal = await erc20.balanceOf(address)
    return parseFloat(ethers.formatUnits(bal, 6))
  }

  /**
   * Get USDT0 balances across all supported chains
   * @param {string} address
   * @returns {object} { chain: balance }
   */
  async getAllBalances (address) {
    const result = {}
    const chains = Object.keys(CHAINS)

    await Promise.allSettled(
      chains.map(async chain => {
        try {
          result[chain] = await this.getBalance(chain, address)
        } catch {
          result[chain] = null
        }
      })
    )

    return result
  }
}
