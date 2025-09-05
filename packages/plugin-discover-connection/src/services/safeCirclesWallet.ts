import { type IAgentRuntime, logger } from '@elizaos/core';
import { type Address, type Hash, isAddress } from 'viem';
import Safe from '@safe-global/protocol-kit';

/**
 * Safe wallet provider for Circles trust operations on Gnosis chain
 * Uses Safe SDK to execute transactions from a Safe smart account
 */
export class SafeCirclesWalletProvider {
  private runtime: IAgentRuntime;
  private safeAddress: Address;
  private privateKey: `0x${string}`;
  private rpcUrl: string;

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;

    // Get the Safe address
    const safeAddress = this.runtime.getSetting('SAFE_ADDRESS');
    if (!safeAddress || !isAddress(safeAddress)) {
      throw new Error(
        'SAFE_ADDRESS environment variable is required and must be a valid address when using Safe wallet'
      );
    }
    this.safeAddress = safeAddress as Address;

    // Get the private key for signing
    const privateKey = this.runtime.getSetting('EVM_PRIVATE_KEY') as `0x${string}`;
    if (!privateKey) {
      throw new Error('EVM_PRIVATE_KEY is required for Safe wallet operations');
    }
    this.privateKey = privateKey;

    // Get RPC URL for Gnosis chain
    this.rpcUrl =
      this.runtime.getSetting('ETHEREUM_PROVIDER_GNOSIS') ||
      this.runtime.getSetting('EVM_PROVIDER_URL') ||
      'https://rpc.gnosischain.com';

    logger.info(
      `[safe-circles-wallet] Initialized Safe wallet provider with address: ${this.safeAddress}`
    );
  }

  /**
   * Get the Safe wallet address
   */
  getAddress(): Address {
    return this.safeAddress;
  }

  /**
   * Send a transaction through the Safe
   */
  async sendTransaction(params: {
    to: Address;
    data: `0x${string}`;
    value?: bigint;
  }): Promise<Hash> {
    if (!isAddress(params.to)) {
      throw new Error('Invalid transaction recipient address');
    }

    try {
      logger.info(`[safe-circles-wallet] Preparing Safe transaction to ${params.to}`);

      // Initialize Safe Protocol Kit with the RPC URL and private key
      const protocolKit = await Safe.init({
        provider: this.rpcUrl,
        signer: this.privateKey,
        safeAddress: this.safeAddress,
      });

      // Verify the Safe is deployed
      const isDeployed = await protocolKit.isSafeDeployed();
      if (!isDeployed) {
        throw new Error(`Safe at address ${this.safeAddress} is not deployed`);
      }

      // Create the Safe transaction
      const safeTransactionData = {
        to: params.to,
        value: (params.value || 0n).toString(),
        data: params.data,
      };

      const safeTransaction = await protocolKit.createTransaction({
        transactions: [safeTransactionData],
      });

      logger.info(`[safe-circles-wallet] Created Safe transaction, signing and executing...`);

      // Sign the transaction with the signer's private key
      const signedTransaction = await protocolKit.signTransaction(safeTransaction);

      // Execute the transaction (since only one signature is required)
      const executeTxResponse = await protocolKit.executeTransaction(signedTransaction);
      const txHash = executeTxResponse.hash as Hash;

      logger.info(`[safe-circles-wallet] Safe transaction executed successfully: ${txHash}`);
      return txHash;
    } catch (error) {
      logger.error(`[safe-circles-wallet] Safe transaction failed:`, error);
      throw error;
    }
  }

  /**
   * Get Safe client for advanced operations (if needed)
   */
  async getSafeClient(): Promise<Safe> {
    return await Safe.init({
      provider: this.rpcUrl,
      signer: this.privateKey,
      safeAddress: this.safeAddress,
    });
  }
}
