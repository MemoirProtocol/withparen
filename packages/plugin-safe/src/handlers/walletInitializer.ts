import { logger, type IAgentRuntime, type Memory, type HandlerCallback } from '@elizaos/core';
import { SafeWalletService } from '../services/SafeWalletService';

/**
 * Handles automatic wallet creation on first user message
 */
export const walletInitializationHandler = async (
  runtime: IAgentRuntime,
  message: Memory,
  callback?: HandlerCallback
): Promise<void> => {
  try {
    // Skip if message is from the agent itself
    if (message.entityId === runtime.agentId) {
      return;
    }

    const service = runtime.getService<SafeWalletService>('safe-wallet');
    if (!service) {
      logger.warn('Safe Wallet Service not available for automatic wallet creation');
      return;
    }

    const userId = message.entityId;
    if (!userId) {
      logger.warn('No user ID found in message for wallet creation');
      return;
    }

    // Check if user already has a wallet
    const hasWallet = await service.hasWallet(userId);
    if (hasWallet) {
      // User already has a wallet, no need to create
      return;
    }

    logger.info(`Creating Safe wallet automatically for new user: ${userId}`);

    // Create wallet for user
    const result = await service.ensureWalletExists(userId);
    
    if (result.isNewWallet && callback) {
      // Send one-time notification about wallet creation
      const notificationMessage = `🎉 Welcome! I've automatically created a Safe smart account for you.

🔒 **Your Safe Address:** ${result.wallet.safeAddress}

✨ **What this means:**
• You have a secure Safe smart account wallet
• I currently manage this wallet on your behalf
• All transactions are secured by Safe's battle-tested smart contracts
• In the future, you'll be able to take full custody of this wallet

Your wallet is ready to use! Try saying "check balance" to see your current balance.`;

      await callback({
        text: notificationMessage,
        action: 'WALLET_CREATED',
      });

      logger.info(`Successfully created Safe wallet for user ${userId} at address ${result.wallet.safeAddress}`);
    }
  } catch (error) {
    logger.error('Error in automatic wallet creation:', error);
    // Don't throw - this should not break the main message flow
  }
};