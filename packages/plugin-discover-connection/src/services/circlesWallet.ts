import { type IAgentRuntime, logger } from '@elizaos/core';
import {
  type Address,
  type Hash,
  type WalletClient,
  createWalletClient,
  http,
  defineChain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Simplified wallet provider for Circles trust operations on Gnosis chain
 */
export class CirclesWalletProvider {
  private walletClient: WalletClient;
  private runtime: IAgentRuntime;

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
    this.walletClient = this.initializeWalletClient();
  }

  private initializeWalletClient(): WalletClient {
    const privateKey = this.runtime.getSetting('EVM_PRIVATE_KEY') as `0x${string}`;
    if (!privateKey) {
      throw new Error('EVM_PRIVATE_KEY is required for Circles trust operations');
    }

    // Define Gnosis chain configuration
    const gnosis = defineChain({
      id: 100,
      name: 'Gnosis',
      nativeCurrency: {
        decimals: 18,
        name: 'xDAI',
        symbol: 'xDAI',
      },
      rpcUrls: {
        default: {
          http: [
            this.runtime.getSetting('ETHEREUM_PROVIDER_GNOSIS') ||
              this.runtime.getSetting('EVM_PROVIDER_URL') ||
              'https://rpc.gnosischain.com',
          ],
        },
      },
      blockExplorers: {
        default: {
          name: 'Gnosis Chain Explorer',
          url: 'https://gnosisscan.io',
        },
      },
    });

    const account = privateKeyToAccount(privateKey);

    const client = createWalletClient({
      account,
      chain: gnosis,
      transport: http(),
    });

    logger.info(`[circles-wallet] Initialized wallet with address: ${account.address}`);
    return client;
  }

  /**
   * Get the wallet address
   */
  getAddress(): Address {
    if (!this.walletClient.account) {
      throw new Error('Wallet account not available');
    }
    return this.walletClient.account.address;
  }

  /**
   * Send a transaction
   */
  async sendTransaction(params: {
    to: Address;
    data: `0x${string}`;
    value?: bigint;
  }): Promise<Hash> {
    if (!this.walletClient.account) {
      throw new Error('Wallet account not available');
    }

    try {
      const hash = await this.walletClient.sendTransaction({
        account: this.walletClient.account,
        to: params.to,
        data: params.data,
        value: params.value || 0n,
        chain: this.walletClient.chain,
      });

      logger.info(`[circles-wallet] Transaction sent: ${hash}`);
      return hash;
    } catch (error) {
      logger.error(`[circles-wallet] Transaction failed:`, error);
      throw error;
    }
  }

  /**
   * Get wallet client for advanced operations
   */
  getWalletClient(): WalletClient {
    return this.walletClient;
  }
}
