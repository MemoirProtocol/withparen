import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '@elizaos/core';
import { ethers } from 'ethers';
import { SafeWalletService } from '../services/SafeWalletService';

export const sendEthAction: Action = {
  name: 'SEND_ETH',
  similes: ['TRANSFER_ETH', 'SEND_ETHEREUM', 'TRANSFER'],
  description: 'Sends ETH from user Safe smart account to a specified address',

  validate: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<boolean> => {
    // Always available for wallet-related conversations
    // The LLM will decide when to trigger this action
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const service = runtime.getService<SafeWalletService>('safe-wallet');
      if (!service) {
        throw new Error('Safe Wallet Service not available');
      }

      const userId = message.entityId;
      if (!userId) {
        throw new Error('User ID not found');
      }

      // Check if user has a wallet
      const wallet = await service.getUserWallet(userId);
      if (!wallet) {
        const response = 'You don\'t have a Safe smart account yet. Say "create wallet" to get started!';
        
        if (callback) {
          await callback({
            text: response,
            action: 'SEND_ETH',
          });
        }

        return {
          success: false,
          text: response,
          data: {
            action: 'SEND_ETH',
            error: 'no_wallet',
          },
        };
      }

      // Parse the message for amount and recipient
      const text = message.content.text || '';
      
      // Extract amount (supports various formats: "0.5 ETH", "1 eth", "0.001")
      const amountMatch = text.match(/(\d+\.?\d*)\s*(eth|ethereum)?/i);
      if (!amountMatch) {
        throw new Error('Could not parse amount from message');
      }
      const amount = amountMatch[1];

      // Extract recipient address
      const addressMatch = text.match(/0x[a-fA-F0-9]{40}/);
      if (!addressMatch) {
        throw new Error('Could not find valid Ethereum address');
      }
      const recipientAddress = addressMatch[0];

      // Validate address
      if (!ethers.isAddress(recipientAddress)) {
        throw new Error('Invalid recipient address');
      }

      // Get current balance
      const balance = await service.getBalance(userId);
      if (!balance) {
        throw new Error('Could not fetch Safe balance');
      }

      const balanceInEth = parseFloat(ethers.formatEther(balance.balance));
      const amountToSend = parseFloat(amount);

      if (amountToSend > balanceInEth) {
        const response = `Insufficient balance. You have ${balance.formattedBalance} but trying to send ${amount} ETH.`;
        
        if (callback) {
          await callback({
            text: response,
            action: 'SEND_ETH',
          });
        }

        return {
          success: false,
          text: response,
          data: {
            action: 'SEND_ETH',
            error: 'insufficient_balance',
            balance: balance.formattedBalance,
            requested: `${amount} ETH`,
          },
        };
      }

      // Send transaction via Safe
      logger.info(`Sending ${amount} ETH from Safe ${wallet.safeAddress} to ${recipientAddress}`);
      
      const txHash = await service.sendTransaction(userId, {
        to: recipientAddress,
        value: amount,
      });

      const response = `✅ Safe transaction sent successfully!\n\n📤 Amount: ${amount} ETH\n📍 To: ${recipientAddress}\n🔗 Transaction: ${txHash}\n🔒 From Safe: ${wallet.safeAddress}\n\nNote: This is on Sepolia testnet. Transaction will be confirmed in a few seconds.`;

      if (callback) {
        await callback({
          text: response,
          action: 'SEND_ETH',
        });
      }

      return {
        success: true,
        text: response,
        data: {
          action: 'SEND_ETH',
          transactionHash: txHash,
          amount: `${amount} ETH`,
          from: wallet.safeAddress,
          to: recipientAddress,
        },
      };
    } catch (error) {
      logger.error('Error in SEND_ETH action:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to send transaction';
      const response = `Sorry, I couldn't send the transaction: ${errorMessage}`;
      
      if (callback) {
        await callback({
          text: response,
          error: true,
        });
      }

      return {
        success: false,
        text: response,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: '{{userName}}',
        content: {
          text: 'Send 0.5 ETH to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: '✅ Transaction sent successfully!\n\n📤 Amount: 0.5 ETH\n📍 To: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e\n🔗 Transaction: 0xabc123...',
          action: 'SEND_ETH',
        },
      },
    ],
    [
      {
        name: '{{userName}}',
        content: {
          text: 'Transfer 1 ethereum to 0x123456789abcdef123456789abcdef123456789a',
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: '✅ Transaction sent successfully!',
          action: 'SEND_ETH',
        },
      },
    ],
  ],
};