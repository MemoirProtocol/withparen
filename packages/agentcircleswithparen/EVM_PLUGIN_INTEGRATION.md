# EVM Plugin Integration Guide

## Overview

The EVM plugin has been successfully integrated into your agentbarista project. This plugin provides comprehensive functionality for interacting with EVM-compatible blockchains including:

- Token transfers
- Cross-chain bridging via LiFi
- Token swapping
- Wallet balance tracking
- Multi-chain support

## Setup

### 1. Environment Variables

Add the following to your `.env` file:

```env
# Required - Your private key for signing transactions
EVM_PRIVATE_KEY=0x1234567890abcdef...

# Optional - Custom RPC URLs
EVM_PROVIDER_URL=https://your-custom-mainnet-rpc-url
ETHEREUM_PROVIDER_BASE=https://base-mainnet.rpc.url
ETHEREUM_PROVIDER_ARBITRUM=https://arbitrum-mainnet.rpc.url
```

### 2. Character Configuration

The plugin is already added to your character configuration in `src/character.ts`:

```typescript
plugins: [
  '@elizaos/plugin-sql',
  '@elizaos/plugin-google-genai',
  '@elizaos/plugin-telegram',
  '@elizaos/plugin-evm'  // ← Added here
],
```

### 3. Chain Configuration (Optional)

To enable additional chains beyond Ethereum mainnet, add them to your character settings:

```typescript
settings: {
  chains: {
    evm: [
      "base", 
      "arbitrum", 
      "polygon",
      "optimism"
    ]
  },
  // ... other settings
}
```

## Available Actions

Your agent can now perform the following EVM operations:

### 1. Token Transfers
```
Transfer 1 ETH to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e
```

### 2. Cross-Chain Bridging
```
Bridge 1 ETH from Ethereum to Base
```

### 3. Token Swapping
```
Swap 1 ETH for USDC on Base
```

### 4. Governance Operations
```
Propose a proposal to the 0xdeadbeef00000000000000000000000000000000 governor on Ethereum
Vote on proposal ID 1 to support on the governor at 0xdeadbeef00000000000000000000000000000000
```

## Testing

To test the integration:

1. Build the project:
```bash
bun run build
```

2. Start your agent:
```bash
bun run start
```

3. Test with a simple command like:
```
What's my wallet balance?
```

## Security Notes

- Keep your `EVM_PRIVATE_KEY` secure and never commit it to version control
- Use testnet keys for development and testing
- The plugin supports TEE (Trusted Execution Environment) mode for enhanced security

## Next Steps

1. Set up your environment variables
2. Test basic functionality with small amounts on testnets first
3. Configure additional chains as needed
4. Explore the governance features if working with DAOs

## Support

For issues or questions:
- Check the plugin documentation in `packages/plugin-evm/README.md`
- Review the source code in `packages/plugin-evm/src/`
- Test with the provided examples

The plugin is now ready to use with your agentbarista!