import type {
  Provider,
  ProviderResult,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '@elizaos/core';
import { SafeWalletService } from '../services/SafeWalletService';

export const walletProvider: Provider = {
  name: 'WALLET_INFO_PROVIDER',
  description: 'Provides context about user Safe smart account and balance',

  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<ProviderResult> => {
    try {
      const service = runtime.getService<SafeWalletService>('safe-wallet');
      if (!service) {
        return {
          text: 'Safe wallet service not available',
          values: {},
          data: {},
        };
      }

      const userId = (message as any).userId || message.agentId || message.roomId;
      if (!userId) {
        return {
          text: 'User context not available',
          values: {},
          data: {},
        };
      }

      const wallet = await service.getUserWallet(userId);
      if (!wallet) {
        return {
          text: 'User does not have a Safe smart account yet. A wallet will be created automatically on their first interaction.',
          values: {
            hasWallet: false,
          },
          data: {
            hasWallet: false,
          },
        };
      }

      const balance = await service.getBalance(userId);
      const balanceText = balance ? balance.formattedBalance : 'Unknown';

      return {
        text: `User Safe: ${wallet.safeAddress} | Balance: ${balanceText} | Owners: ${wallet.owners.length} | Network: Sepolia Testnet | Note: Paren has delegated signing permissions and can execute transactions on behalf of the user. User can revoke these permissions at any time.`,
        values: {
          hasWallet: true,
          safeAddress: wallet.safeAddress,
          owners: wallet.owners.length,
          balance: balanceText,
          network: 'sepolia',
          delegatedCustody: true,
        },
        data: {
          hasWallet: true,
          wallet,
          balance,
          delegatedCustody: true,
        },
      };
    } catch (error) {
      logger.error('Error in wallet provider:', error);
      return {
        text: 'Error fetching Safe wallet information',
        values: {},
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
};