import type { Plugin } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { z } from 'zod';
import { SafeWalletService } from './services/SafeWalletService';
import { sendEthAction } from './actions/sendEth';
import { checkBalanceAction } from './actions/checkBalance';
import { walletInitializationHandler } from './handlers/walletInitializer';
import { walletProvider } from './providers/walletProvider';
import { safeActionsProvider } from './providers/actionsProvider';

const configSchema = z.object({
  ETHEREUM_RPC_URL: z
    .string()
    .url()
    .optional()
    .default('https://sepolia.optimism.io'), // Optimism Sepolia for Ocean Protocol
  CHAIN_ID: z
    .number()
    .optional()
    .default(11155420), // Optimism Sepolia chain ID
  DELEGATEE_ADDRESS: z
    .string()
    .optional()
    .default('0x67BdF78EA1E13D17e39A7f37b816C550359DA1e7'),
  DELEGATEE_PRIVATE_KEY: z
    .string()
    .min(1, 'DELEGATEE_PRIVATE_KEY is required')
    .optional(),
  SAFE_VERSION: z
    .string()
    .optional()
    .default('1.4.1'),
});

export const safePlugin: Plugin = {
  name: 'plugin-safe',
  description: 'Safe smart account integration for individual user accounts with delegated permissions',
  
  config: {
    ETHEREUM_RPC_URL: process.env.ETHEREUM_RPC_URL,
    CHAIN_ID: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : undefined,
    DELEGATEE_ADDRESS: process.env.DELEGATEE_ADDRESS,
    DELEGATEE_PRIVATE_KEY: process.env.DELEGATEE_PRIVATE_KEY,
    SAFE_VERSION: process.env.SAFE_VERSION,
  },

  async init(config: Record<string, any>) {
    logger.info('Initializing Safe Protocol plugin');
    
    try {
      const validatedConfig = await configSchema.parseAsync(config);
      
      // Set environment variables
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value !== undefined) {
          process.env[key] = String(value);
        }
      }
      
      logger.info(`Safe Protocol plugin configuration validated - Chain ID: ${validatedConfig.CHAIN_ID}, Delegatee: ${validatedConfig.DELEGATEE_ADDRESS}`);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid Safe Protocol plugin configuration: ${error.errors.map((e) => e.message).join(', ')}`
        );
      }
      throw error;
    }
  },

  services: [SafeWalletService],
  
  actions: [
    sendEthAction,
    checkBalanceAction,
  ],
  
  providers: [walletProvider, safeActionsProvider],

  // Handle automatic wallet creation on first user interaction
  events: {
    MESSAGE_RECEIVED: [
      async ({ runtime, message, callback }) => {
        await walletInitializationHandler(runtime, message, callback);
      },
    ],
  },
};

export default safePlugin;