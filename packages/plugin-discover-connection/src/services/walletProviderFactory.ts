import { type IAgentRuntime, logger } from '@elizaos/core';
import { CirclesWalletProvider } from './circlesWallet.js';
import { SafeCirclesWalletProvider } from './safeCirclesWallet.js';

export type WalletType = 'EOA' | 'SAFE';

export interface ICirclesWalletProvider {
  getAddress(): string;
  sendTransaction(params: { to: string; data: `0x${string}`; value?: bigint }): Promise<string>;
}

/**
 * Factory function to create the appropriate wallet provider based on configuration
 * @param runtime - The agent runtime instance
 * @returns The configured wallet provider (EOA or Safe)
 */
export function createWalletProvider(runtime: IAgentRuntime): ICirclesWalletProvider {
  const walletType = (runtime.getSetting('EVM_WALLET_TYPE') || 'EOA').toUpperCase() as WalletType;

  logger.info(`[wallet-factory] Creating wallet provider for type: ${walletType}`);

  switch (walletType) {
    case 'EOA':
      return new CirclesWalletProvider(runtime);

    case 'SAFE':
      return new SafeCirclesWalletProvider(runtime);

    default:
      logger.warn(`[wallet-factory] Unknown wallet type '${walletType}', defaulting to EOA`);
      return new CirclesWalletProvider(runtime);
  }
}
