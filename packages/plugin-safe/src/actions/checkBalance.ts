import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '@elizaos/core';
import { SafeWalletService } from '../services/SafeWalletService';

export const checkBalanceAction: Action = {
  name: 'CHECK_BALANCE',
  similes: ['GET_BALANCE', 'SHOW_BALANCE', 'WALLET_BALANCE', 'MY_BALANCE'],
  description: 'Checks the ETH balance of the user Safe smart account',

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
            action: 'CHECK_BALANCE',
          });
        }

        return {
          success: false,
          text: response,
          data: {
            action: 'CHECK_BALANCE',
            error: 'no_wallet',
          },
        };
      }

      // Get balance
      const balance = await service.getBalance(userId);
      if (!balance) {
        throw new Error('Could not fetch balance');
      }

      const lastUsedText = wallet.lastUsed 
        ? `\n⏰ Last used: ${new Date(wallet.lastUsed).toLocaleString()}`
        : '';

      const response = `💰 Safe Balance\n\n🔒 Safe Address: ${wallet.safeAddress}\n💎 Balance: ${balance.formattedBalance}\n🔗 Network: Sepolia Testnet\n👤 Managed by: Agent${lastUsedText}\n\nTo get testnet ETH, visit a Sepolia faucet.`;

      if (callback) {
        await callback({
          text: response,
          action: 'CHECK_BALANCE',
        });
      }

      return {
        success: true,
        text: response,
        data: {
          action: 'CHECK_BALANCE',
          address: wallet.safeAddress,
          balance: balance.formattedBalance,
          balanceWei: balance.balance,
        },
      };
    } catch (error) {
      logger.error('Error in CHECK_BALANCE action:', error);
      
      const errorMessage = 'Sorry, I couldn\'t check your balance. Please try again.';
      
      if (callback) {
        await callback({
          text: errorMessage,
        });
      }

      return {
        success: false,
        text: errorMessage,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: '{{userName}}',
        content: {
          text: 'Check my balance',
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: '💰 Safe Balance\n\n🔒 Safe Address: 0x742d35Cc6634C0532925a3b844Bc454e4438f44e\n💎 Balance: 1.5 ETH\n🔗 Network: Sepolia Testnet\n👤 Managed by: Agent',
          action: 'CHECK_BALANCE',
        },
      },
    ],
    [
      {
        name: '{{userName}}',
        content: {
          text: 'How much ETH do I have?',
        },
      },
      {
        name: '{{agentName}}',
        content: {
          text: '💰 Safe Balance\n\n🔒 Safe Address: 0x123...\n💎 Balance: 0.25 ETH\n👤 Managed by: Agent',
          action: 'CHECK_BALANCE',
        },
      },
    ],
  ],
};