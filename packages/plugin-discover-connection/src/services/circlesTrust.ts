import { type IAgentRuntime, logger } from '@elizaos/core';
import { type Address, type Hash, parseAbi, encodeFunctionData, isAddress } from 'viem';
import { createWalletProvider, type ICirclesWalletProvider } from './walletProviderFactory.js';

export interface TrustResult {
  success: boolean;
  transactionHash?: Hash;
  error?: string;
}

/**
 * Service to handle Circles trust operations
 * Manages trust transactions to add users to Paren's Circles group
 */
export class CirclesTrustService {
  private walletProvider: ICirclesWalletProvider;
  private runtime: IAgentRuntime;
  private circlesGroupCA: Address;

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
    this.walletProvider = createWalletProvider(runtime);

    const groupCA = this.runtime.getSetting('CIRCLES_GROUP_CA');
    if (!groupCA || !isAddress(groupCA)) {
      throw new Error('CIRCLES_GROUP_CA environment variable is not set or invalid');
    }
    this.circlesGroupCA = groupCA as Address;

    logger.info(`[circles-trust] Initialized service for Circles group: ${this.circlesGroupCA}`);
  }

  /**
   * Execute a trust transaction to add a user to Paren's Circles group
   * @param trustReceiver - The wallet address to trust
   * @param expiry - Expiry timestamp (optional, defaults to permanent trust)
   * @returns Trust result with transaction hash or error
   */
  async trustUser(trustReceiver: string, expiry?: bigint): Promise<TrustResult> {
    try {
      // Validate the trust receiver address
      if (!isAddress(trustReceiver)) {
        return {
          success: false,
          error: 'Invalid trust receiver address format',
        };
      }

      const trustReceiverAddress = trustReceiver as Address;

      // Default to permanent trust (maximum uint96 value)
      const trustExpiry = expiry || BigInt('0x1fffffffffffff');

      logger.info(
        `[circles-trust] Executing trust for ${trustReceiverAddress} with expiry ${trustExpiry}`
      );

      // Encode the trust function call
      const trustData = encodeFunctionData({
        abi: parseAbi(['function trust(address _trustReceiver, uint96 _expiry)']),
        functionName: 'trust',
        args: [trustReceiverAddress, trustExpiry],
      });

      // Send the transaction
      const transactionHash = (await this.walletProvider.sendTransaction({
        to: this.circlesGroupCA,
        data: trustData,
        value: 0n, // No ETH needed for trust operation
      })) as Hash;

      logger.info(`[circles-trust] Trust transaction successful: ${transactionHash}`);

      return {
        success: true,
        transactionHash,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[circles-trust] Trust operation failed:`, error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get the Circles group contract address
   */
  getCirclesGroupAddress(): Address {
    return this.circlesGroupCA;
  }

  /**
   * Get the wallet address that will execute the trust transactions
   */
  getWalletAddress(): Address {
    return this.walletProvider.getAddress() as Address;
  }
}
