# @elizaos/plugin-lit

Lit Protocol Vincent integration plugin for ElizaOS - enables non-custodial wallet creation and management for users through conversational AI.

## Overview

This plugin integrates the Lit Protocol Vincent framework to provide:
- **Non-custodial wallets**: Each user gets their own PKP (Programmable Key Pair) wallet
- **Conversational interface**: No browser or external apps needed
- **Secure delegation**: Agent requests signing permissions via Vincent framework
- **Ethereum support**: Initially supporting Sepolia testnet

## Features

### Actions
- **CREATE_WALLET**: Creates a new PKP wallet for the user
- **SEND_ETH**: Sends ETH from user's wallet to another address
- **CHECK_BALANCE**: Checks the user's wallet balance

### Service
- **LitWalletService**: Manages Lit Protocol connections and user wallets

### Provider
- **walletProvider**: Supplies wallet context to the agent

## Installation

```bash
bun add @elizaos/plugin-lit
```

## Configuration

Add to your character configuration:

```typescript
{
  plugins: [
    '@elizaos/plugin-lit'
  ]
}
```

### Environment Variables

```bash
# Lit Network (optional, defaults to datil-dev)
LIT_NETWORK=datil-dev

# Ethereum RPC URL (optional, defaults to Sepolia)
ETHEREUM_RPC_URL=https://sepolia.drpc.org

# Chain ID (optional, defaults to Sepolia: 11155111)
CHAIN_ID=11155111
```

## Usage Examples

### Create a Wallet
```
User: Create a wallet for me
Agent: ✨ Your new non-custodial wallet has been created!
       🔑 Address: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e
```

### Check Balance
```
User: Check my balance
Agent: 💰 Wallet Balance
       📍 Address: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e
       💎 Balance: 1.5 ETH
       🔗 Network: Sepolia Testnet
```

### Send ETH
```
User: Send 0.5 ETH to 0x123456789abcdef123456789abcdef123456789a
Agent: ✅ Transaction sent successfully!
       📤 Amount: 0.5 ETH
       📍 To: 0x123456789abcdef123456789abcdef123456789a
       🔗 Transaction: 0xabc123...
```

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Test
bun test

# Development mode
bun run dev
```

## Architecture

The plugin follows ElizaOS patterns:

1. **Service Layer**: `LitWalletService` manages all Lit Protocol interactions
2. **Actions**: Handle user commands for wallet operations
3. **Provider**: Supplies wallet context to the agent
4. **Non-custodial**: Users maintain control via PKPs

## Security

- Wallets are non-custodial (user controlled via PKPs)
- Agent requests signing permissions through Vincent framework
- No private keys are stored or accessible by the agent
- All transactions require user's PKP authorization

## Testing

Currently configured for Sepolia testnet. To get test ETH:
1. Create a wallet
2. Copy your address
3. Visit a Sepolia faucet (e.g., https://sepoliafaucet.com)
4. Request test ETH

## Future Enhancements

- [ ] Full Vincent framework integration for advanced permissions
- [ ] Multi-chain support (Polygon, Arbitrum, etc.)
- [ ] Token transfers (ERC-20)
- [ ] NFT support
- [ ] DeFi integrations
- [ ] Advanced access control policies

## License

MIT