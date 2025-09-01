# Trust Action for Circles Protocol

This document describes the Trust action that has been added to the EVM plugin for interacting with the Circles protocol.

## Overview

The Trust action allows an agent to trust wallet addresses in the Circles protocol, enabling them to receive group tokens. This is implemented as a smart contract interaction with the Circles Group contract.

## Configuration

### Environment Variables

The following environment variable must be set:

```bash
CIRCLES_GROUP_CA=0xafe299bb2c0ab0c90b0b9be3440672797f45981d
```

This is the address of the Circles Group contract on the Gnosis chain.

### Required Settings

- `EVM_PRIVATE_KEY`: The private key of the wallet that has authority to make trust calls
- `CIRCLES_GROUP_CA`: The contract address for the Circles Group

## Usage

### Action Name
`EVM_TRUST`

### Parameters
- `trustReceiver`: The wallet address to trust (must be a valid Ethereum address)
- `chain`: The blockchain to execute on (typically 'gnosis' for Circles)
- `expiry`: Optional timestamp when trust expires (defaults to permanent trust)

### Example Usage

Users can interact with the agent using natural language:

```
"Trust 0x88B811419A2Ad503e53F0B208e24c99767927Aab"
"Trust wallet 0x88B811419A2Ad503e53F0B208e24c99767927Aab"
"Add trust for 0x88B811419A2Ad503e53F0B208e24c99767927Aab"
```

### Contract Interaction

The action calls the `trust` function on the Circles Group contract:

```solidity
function trust(address _trustReceiver, uint96 _expiry) external onlyOwner
```

- `_trustReceiver`: The address to trust
- `_expiry`: The timestamp when trust expires (uses maximum uint96 value for permanent trust)

### Transaction Data

The transaction data follows this format:
- Function selector: `0x75dcebc7` (trust function)
- Parameters: encoded address and expiry timestamp

Example transaction data:
```
0x75dcebc700000000000000000000000088b811419a2ad503e53f0b208e24c99767927aab000000000000000000000000000000000000000000000000001fffffffffffff
```

## Implementation Details

### Files Added/Modified

1. **`src/actions/trust.ts`** - Main trust action implementation
2. **`src/templates/index.ts`** - Added trust template for LLM parsing
3. **`src/types/index.ts`** - Added TrustParams interface
4. **`src/index.ts`** - Exported trust action and added to plugin
5. **`src/tests/trust.test.ts`** - Unit tests for trust functionality

### Key Features

- **Environment Variable Validation**: Ensures CIRCLES_GROUP_CA is set
- **Address Validation**: Validates Ethereum addresses
- **Chain Support**: Works with configured EVM chains (primarily Gnosis)
- **Error Handling**: Comprehensive error handling and user feedback
- **Testing**: Full test coverage including edge cases

### Security Considerations

- Only wallets with proper authority can execute trust operations
- The contract enforces `onlyOwner` modifier for trust calls
- All addresses are validated before transaction submission
- Private keys are handled securely through the existing wallet provider

## Testing

Run the trust action tests:

```bash
npm test -- trust.test.ts
```

The tests cover:
- Constructor initialization
- Parameter validation
- Environment variable requirements
- Transaction data generation
- Null expiry value handling
- Error handling

## Integration

The trust action is automatically available when the EVM plugin is loaded. It integrates with:

- **Wallet Provider**: For transaction signing and submission
- **Template System**: For natural language parsing
- **Error Handling**: For user-friendly error messages
- **Validation System**: For parameter and environment validation

## Troubleshooting

### Common Issues

1. **"Failed to parse String to BigInt" Error**
   - **Cause**: This was an issue with null expiry value handling
   - **Solution**: Fixed in the latest version - null expiry values are now properly converted to permanent trust

2. **"CIRCLES_GROUP_CA environment variable is not set" Error**
   - **Cause**: Missing environment variable
   - **Solution**: Add `CIRCLES_GROUP_CA=0xafe299bb2c0ab0c90b0b9be3440672797f45981d` to your .env file

3. **"Chain not configured" Error**
   - **Cause**: The specified chain is not supported by the wallet provider
   - **Solution**: Ensure Gnosis chain is configured in your EVM provider settings

4. **Transaction Fails**
   - **Cause**: Insufficient permissions or gas
   - **Solution**: Ensure the wallet has authority to call the trust function and sufficient gas