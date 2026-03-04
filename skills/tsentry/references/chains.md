# Supported Chains

## Wallet (WDK EVM)
Any EVM-compatible chain. Currently configured for Sepolia testnet (chain 11155111).

## Swap (Velora)
| Chain | Chain ID | Status |
|-------|----------|--------|
| Ethereum | 1 | Supported |
| Arbitrum | 42161 | Supported |
| Polygon | 137 | Supported |
| BSC | 56 | Supported |
| Base | 8453 | Supported |
| Optimism | 10 | Supported |
| Avalanche | 43114 | Supported |
| Fantom | 250 | Supported |
| Polygon zkEVM | 1101 | Supported |

Testnets (Sepolia, etc.) fall back to Uniswap V3 direct.

## Bridge (USDT0 / LayerZero V2)
| Chain | EID | OFT Contract |
|-------|-----|-------------|
| Ethereum | 30101 | `0x6C96dE32CEa08842dcc4058c14d3aaAD7Fa41dee` |
| Arbitrum | 30110 | `0x14E4A1B13bf7F943c8ff7C51fb60FA964A298D92` |
| Berachain | 30362 | `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` |
| Ink | 30339 | `0x0200C29006150606B650577BBE7B6248F58470c1` |

## Lending (Aave V3)
| Network | Pool Address |
|---------|-------------|
| Sepolia Testnet | `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` |
| Ethereum Mainnet | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` |
| Arbitrum | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` |

## ERC-4337 Account Abstraction
Supported on any EVM chain with EntryPoint v0.7 deployed:
- EntryPoint: `0x0000000071727De22E5E9d8BAf0edAc6f37da032`
- Requires bundler service (Pimlico, StackUp, Alto, Biconomy)
