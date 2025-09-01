import { Service, logger } from '@elizaos/core';
import type { IAgentRuntime } from '@elizaos/core';
import Safe from '@safe-global/protocol-kit';
import { ethers } from 'ethers';
import type { UserWallet, TransactionRequest, WalletBalance, SafeTransaction } from '../types';

// Simple module contract ABI for enabling module permissions
const MODULE_ABI = [
  'function enableModule(address module) external',
  'function disableModule(address prevModule, address module) external',
  'function isModuleEnabled(address module) external view returns (bool)',
  'function getModulesPaginated(address start, uint256 pageSize) external view returns (address[] memory array, address next)'
];

export class SafeWalletService extends Service {
  static serviceType = 'safe-wallet';
  
  private provider: ethers.JsonRpcProvider | null = null;
  private signer: ethers.Wallet | null = null;
  private chainId: number = 11155111;
  private isInitialized = false;
  private delegateeAddress: string;

  capabilityDescription = 'Manages Safe smart accounts for users with delegated permissions';

  constructor(protected runtime: IAgentRuntime) {
    super(runtime);
    this.delegateeAddress = process.env.DELEGATEE_ADDRESS || '0x67BdF78EA1E13D17e39A7f37b816C550359DA1e7';
  }

  static async start(runtime: IAgentRuntime): Promise<SafeWalletService> {
    logger.info('Starting Safe Wallet Service');
    const service = new SafeWalletService(runtime);
    await service.initialize();
    return service;
  }

  static async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping Safe Wallet Service');
    const service = runtime.getService<SafeWalletService>(SafeWalletService.serviceType);
    if (service) {
      await service.stop();
    }
  }

  async initialize(): Promise<void> {
    try {
      // Initialize Ethereum provider
      const rpcUrl = process.env.ETHEREUM_RPC_URL || 'https://sepolia.drpc.org';
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      
      const network = await this.provider.getNetwork();
      logger.info(`Connected to Ethereum network: ${network.name} (chainId: ${network.chainId})`);

      // Create a signer for the delegatee address (this should be configured securely)
      const privateKey = process.env.DELEGATEE_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error('DELEGATEE_PRIVATE_KEY environment variable is required');
      }
      
      this.signer = new ethers.Wallet(privateKey, this.provider);
      logger.info(`Initialized delegatee signer: ${this.signer.address}`);

      // Store chain ID from environment
      this.chainId = parseInt(process.env.CHAIN_ID || '11155111');

      this.isInitialized = true;
      logger.info('Safe Wallet Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Safe Wallet Service:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.provider = null;
    this.signer = null;
    this.isInitialized = false;
    logger.info('Safe Wallet Service stopped');
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Safe Wallet Service not initialized');
    }
  }

  /**
   * Save wallet to cache (like dailyPlanning service)
   */
  private async saveWalletToCache(wallet: UserWallet): Promise<void> {
    try {
      logger.debug(`Saving Safe wallet for user ${wallet.userId} to cache`);
      
      const cacheKey = `safe-wallet-${wallet.userId}`;
      const walletData = {
        userId: wallet.userId,
        safeAddress: wallet.safeAddress,
        owners: wallet.owners,
        threshold: wallet.threshold,
        createdAt: wallet.createdAt,
        status: wallet.status,
        moduleEnabled: wallet.moduleEnabled || false,
        deploymentTxHash: wallet.deploymentTxHash,
        lastUsed: wallet.lastUsed,
        delegateeAddress: this.delegateeAddress,
        chainId: this.chainId,
      };

      await this.runtime.setCache(cacheKey, walletData);
      
      logger.debug(`Safe wallet saved successfully for user ${wallet.userId}`);
    } catch (error) {
      logger.error('Failed to save Safe wallet to cache:', error);
      throw error;
    }
  }

  /**
   * Load wallet from cache (like dailyPlanning service)
   */
  private async loadWalletFromCache(userId: string): Promise<UserWallet | null> {
    try {
      const cacheKey = `safe-wallet-${userId}`;
      const walletData = await this.runtime.getCache(cacheKey);
      
      if (walletData && typeof walletData === 'object' && 'safeAddress' in walletData) {
        return {
          userId: walletData.userId,
          safeAddress: walletData.safeAddress,
          owners: walletData.owners,
          threshold: walletData.threshold,
          createdAt: walletData.createdAt,
          status: walletData.status,
          moduleEnabled: walletData.moduleEnabled,
          deploymentTxHash: walletData.deploymentTxHash,
          lastUsed: walletData.lastUsed,
        };
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to load Safe wallet from cache:', error);
      return null;
    }
  }

  /**
   * Update wallet last used timestamp
   */
  private async updateWalletLastUsed(userId: string): Promise<void> {
    try {
      const wallet = await this.loadWalletFromCache(userId);
      if (wallet) {
        wallet.lastUsed = Date.now();
        await this.saveWalletToCache(wallet);
      }
    } catch (error) {
      logger.error('Failed to update wallet last used:', error);
    }
  }

  /**
   * Log transaction to memory
   */
  private async logTransaction(
    userId: string,
    txHash: string,
    fromAddress: string,
    toAddress: string,
    value: string,
    description?: string
  ): Promise<void> {
    try {
      const transaction = {
        txHash,
        fromAddress,
        toAddress,
        value,
        status: 'pending',
        transactionType: 'transfer',
        userId,
        timestamp: Date.now(),
        description: description || `Transfer ${ethers.formatEther(value)} ETH to ${toAddress}`,
      };

      const cacheKey = `safe-tx-${userId}-${txHash}`;
      await this.runtime.setCache(cacheKey, transaction);
      
      logger.debug(`Transaction logged: ${txHash}`);
    } catch (error) {
      logger.error('Failed to log transaction:', error);
    }
  }

  async createWalletForUser(userId: string): Promise<UserWallet> {
    this.ensureInitialized();

    // Check if user already has a wallet in cache
    const existingWallet = await this.loadWalletFromCache(userId);
    if (existingWallet) {
      logger.info(`User ${userId} already has a Safe wallet`);
      return existingWallet;
    }

    try {
      logger.info(`Creating Safe smart account for user ${userId}`);

      // Create Safe account configuration with delegatee as sole owner
      const safeAccountConfig = {
        owners: [this.delegateeAddress],
        threshold: 1, // Single owner can execute transactions
      };

      // Generate unique salt nonce for this user's wallet (numeric only for BigInt conversion)
      // Combine timestamp with userId hash as a number
      const userIdHash = parseInt(userId.slice(-8), 16) || 1; // Convert hex-like userId to number, fallback to 1
      const creationTime = Date.now();
      const saltNonce = (creationTime * 1000 + userIdHash).toString();

      // Create Safe account with v4 API using RPC URL and private key
      logger.info(`Creating Safe with owners: ${safeAccountConfig.owners.join(', ')} and saltNonce: ${saltNonce}`);
      const rpcUrl = process.env.ETHEREUM_RPC_URL || 'https://sepolia.drpc.org';
      const privateKey = process.env.DELEGATEE_PRIVATE_KEY;
      
      const protocolKit = await Safe.init({
        provider: rpcUrl,
        signer: privateKey,
        predictedSafe: {
          safeAccountConfig: safeAccountConfig as any,
          safeDeploymentConfig: {
            saltNonce: saltNonce,
          },
        },
      });
      
      const safeAddress = await protocolKit.getAddress();
      logger.info(`Safe created successfully at address: ${safeAddress} with delegatee as owner`);

      // Create user wallet entry
      const userWalletEntry: UserWallet = {
        userId,
        safeAddress,
        owners: safeAccountConfig.owners,
        threshold: safeAccountConfig.threshold,
        createdAt: creationTime,
        status: 'predicted', // Will be deployed on first transaction
        moduleEnabled: false, // Agent is sole owner
        saltNonce: saltNonce, // Store saltNonce for consistent deployment
      };

      await this.saveWalletToCache(userWalletEntry);

      logger.info(`Created Safe wallet for user ${userId} at address ${safeAddress} with delegatee as owner`);
      return userWalletEntry;
    } catch (error) {
      logger.error(`Failed to create Safe wallet for user ${userId}:`, error);
      throw error;
    }
  }

  private async enableDelegateeModule(safeAddress: string, userWallet: ethers.Wallet): Promise<void> {
    try {
      logger.info(`Enabling delegatee module ${this.delegateeAddress} for Safe ${safeAddress}`);

      // Create a Safe instance connected with the user's wallet (as owner)
      const rpcUrl = process.env.ETHEREUM_RPC_URL || 'https://sepolia.drpc.org';
      const protocolKit = await Safe.init({
        provider: rpcUrl,
        signer: userWallet.privateKey,
        safeAddress: safeAddress,
      });

      // Create transaction to enable the delegatee as a module
      const safeTransactionData = {
        to: safeAddress,
        value: '0',
        data: new ethers.Interface(MODULE_ABI).encodeFunctionData('enableModule', [this.delegateeAddress]),
      };

      const safeTransaction = await protocolKit.createTransaction({
        transactions: [safeTransactionData]
      });
      const signedTransaction = await protocolKit.signTransaction(safeTransaction);
      const executeTxResponse = await protocolKit.executeTransaction(signedTransaction);

      logger.info(`Delegatee module enabled via transaction: ${executeTxResponse.hash}`);
    } catch (error) {
      logger.error(`Failed to enable delegatee module:`, error);
      throw error;
    }
  }

  async getUserWallet(userId: string): Promise<UserWallet | null> {
    return await this.loadWalletFromCache(userId);
  }

  async getBalance(userId: string): Promise<WalletBalance | null> {
    this.ensureInitialized();

    const wallet = await this.getUserWallet(userId);
    if (!wallet) {
      return null;
    }

    try {
      const balance = await this.provider!.getBalance(wallet.safeAddress);
      const formattedBalance = ethers.formatEther(balance);

      return {
        address: wallet.safeAddress,
        balance: balance.toString(),
        formattedBalance: `${formattedBalance} ETH`,
        symbol: 'ETH',
      };
    } catch (error) {
      logger.error(`Failed to get balance for user ${userId}:`, error);
      throw error;
    }
  }

  async sendTransaction(
    userId: string,
    transaction: TransactionRequest
  ): Promise<string> {
    this.ensureInitialized();

    const wallet = await this.getUserWallet(userId);
    if (!wallet) {
      throw new Error(`No Safe wallet found for user ${userId}`);
    }

    try {
      logger.info(`Sending Safe transaction for user ${userId}:`, transaction);

      // Validate transaction
      if (!ethers.isAddress(transaction.to)) {
        throw new Error('Invalid recipient address');
      }

      const value = ethers.parseEther(transaction.value);
      
      // Check balance
      const balance = await this.provider!.getBalance(wallet.safeAddress);
      if (balance < value) {
        throw new Error('Insufficient balance in Safe wallet');
      }

      // Execute transaction as co-owner (delegatee is an owner)
      return await this.executeTransactionAsOwner(wallet, transaction, value);
    } catch (error) {
      logger.error(`Failed to send Safe transaction for user ${userId}:`, error);
      throw error;
    }
  }

  private async executeTransactionAsModule(
    wallet: UserWallet,
    transaction: TransactionRequest,
    value: bigint
  ): Promise<string> {
    try {
      logger.info(`Executing transaction as module for Safe ${wallet.safeAddress}`);

      // Initialize Safe Protocol Kit with delegatee signer
      const rpcUrl = process.env.ETHEREUM_RPC_URL || 'https://sepolia.drpc.org';
      const privateKey = process.env.DELEGATEE_PRIVATE_KEY;
      
      const protocolKit = await Safe.init({
        provider: rpcUrl,
        signer: privateKey,
        safeAddress: wallet.safeAddress,
      });

      // Create Safe transaction
      const safeTransactionData = {
        to: transaction.to,
        value: value.toString(),
        data: transaction.data || '0x',
      };

      const safeTransaction = await protocolKit.createTransaction({
        transactions: [safeTransactionData]
      });
      
      // Since we're enabled as a module, we can execute directly
      const executeTxResponse = await protocolKit.executeTransaction(safeTransaction);
      const txHash = executeTxResponse.hash;

      // Update last used timestamp and log transaction
      await this.updateWalletLastUsed(wallet.userId);
      await this.logTransaction(wallet.userId, txHash, wallet.safeAddress, transaction.to, value.toString());

      logger.info(`Module transaction executed: ${txHash}`);
      return txHash;
    } catch (error) {
      logger.error(`Failed to execute transaction as module:`, error);
      throw error;
    }
  }

  private async ensureSafeDeployed(wallet: UserWallet): Promise<any> {
    try {
      const rpcUrl = process.env.ETHEREUM_RPC_URL || 'https://sepolia.drpc.org';
      const privateKey = process.env.DELEGATEE_PRIVATE_KEY;
      
      // Initialize with predicted Safe configuration
      const safeAccountConfig = {
        owners: [this.delegateeAddress],
        threshold: 1,
      };
      
      // Use the same saltNonce that was generated during wallet creation
      const saltNonce = wallet.saltNonce || ((wallet.createdAt * 1000 + (parseInt(wallet.userId.slice(-8), 16) || 1)).toString());
      logger.debug(`ensureSafeDeployed: Using saltNonce ${saltNonce} for Safe ${wallet.safeAddress}`);
      
      const protocolKit = await Safe.init({
        provider: rpcUrl,
        signer: privateKey,
        predictedSafe: {
          safeAccountConfig: safeAccountConfig as any,
          safeDeploymentConfig: {
            saltNonce: saltNonce,
          },
        },
      });
      
      // Check if already deployed
      const isDeployed = await protocolKit.isSafeDeployed();
      
      if (!isDeployed) {
        logger.info(`Deploying Safe wallet ${wallet.safeAddress} on first use`);
        
        // Create and execute deployment transaction
        const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction();
        
        logger.debug(`Deployment transaction details:`, {
          to: deploymentTransaction.to,
          value: deploymentTransaction.value,
          dataLength: deploymentTransaction.data?.length,
          expectedAddress: wallet.safeAddress,
        });
        
        const ethersWallet = new ethers.Wallet(privateKey, this.provider);
        const txResponse = await ethersWallet.sendTransaction({
          to: deploymentTransaction.to,
          value: deploymentTransaction.value,
          data: deploymentTransaction.data as `0x${string}`,
        });
        
        logger.info(`Safe deployment transaction sent: ${txResponse.hash}`);
        
        // Wait for confirmation and check if deployment succeeded
        const receipt = await txResponse.wait();
        
        if (receipt.status === 0) {
          logger.error(`Safe deployment transaction failed! Tx: ${receipt.hash}`);
          logger.error(`Receipt:`, JSON.stringify(receipt, null, 2));
          throw new Error(`Safe deployment failed: transaction reverted (${receipt.hash})`);
        }
        
        logger.info(`Safe deployed successfully at ${wallet.safeAddress} in tx: ${receipt.hash}`);
        
        // Verify the Safe actually exists at the expected address
        const code = await this.provider!.getCode(wallet.safeAddress);
        if (code === '0x') {
          logger.error(`Safe deployment verification failed: No contract code at ${wallet.safeAddress}`);
          throw new Error(`Safe deployment failed: no contract deployed at expected address ${wallet.safeAddress}`);
        }
        
        logger.info(`Safe deployment verified: contract code exists at ${wallet.safeAddress}`);
        
        // Update wallet status and deployment hash
        wallet.status = 'deployed';
        wallet.deploymentTxHash = receipt.hash;
        await this.saveWalletToCache(wallet);
        
        // Reinitialize protocolKit with the deployed Safe address
        const deployedProtocolKit = await Safe.init({
          provider: rpcUrl,
          signer: privateKey,
          safeAddress: wallet.safeAddress,
        });
        
        return deployedProtocolKit;
      } else {
        logger.debug(`Safe wallet ${wallet.safeAddress} is already deployed`);
        
        // Return protocolKit for already deployed Safe
        const deployedProtocolKit = await Safe.init({
          provider: rpcUrl,
          signer: privateKey,
          safeAddress: wallet.safeAddress,
        });
        
        return deployedProtocolKit;
      }
    } catch (error) {
      logger.error(`Failed to ensure Safe deployment for ${wallet.safeAddress}:`, error);
      throw error;
    }
  }

  private async executeTransactionAsOwner(
    wallet: UserWallet,
    transaction: TransactionRequest,
    value: bigint
  ): Promise<string> {
    try {
      logger.info(`Executing transaction as owner for Safe ${wallet.safeAddress}`);

      // First, ensure the Safe is deployed on-chain (lazy deployment)
      // This returns a protocolKit instance already connected to the deployed Safe
      const protocolKit = await this.ensureSafeDeployed(wallet);

      // Create Safe transaction
      const safeTransactionData = {
        to: transaction.to,
        value: value.toString(),
        data: transaction.data || '0x',
      };

      const safeTransaction = await protocolKit.createTransaction({
        transactions: [safeTransactionData]
      });
      
      // Sign and execute the transaction as an owner
      const signedTransaction = await protocolKit.signTransaction(safeTransaction);
      const executeTxResponse = await protocolKit.executeTransaction(signedTransaction);
      const txHash = executeTxResponse.hash;

      // Update last used timestamp and log transaction
      await this.updateWalletLastUsed(wallet.userId);
      await this.logTransaction(wallet.userId, txHash, wallet.safeAddress, transaction.to, value.toString());

      logger.info(`Owner transaction executed: ${txHash}`);
      return txHash;
    } catch (error) {
      logger.error(`Failed to execute transaction as owner:`, error);
      throw error;
    }
  }

  async getAllUserWallets(): Promise<UserWallet[]> {
    try {
      logger.warn('getAllUserWallets() is not efficiently implemented with cache system. Consider maintaining a wallet registry or using database queries.');
      // Note: This is not efficiently implemented with cache system
      // In a production system, you'd want to maintain a separate registry
      // or use database queries to get all wallets
      return [];
    } catch (error) {
      logger.error('Failed to get all user wallets:', error);
      return [];
    }
  }

  /**
   * Check if user has a wallet (for automatic wallet creation)
   */
  async hasWallet(userId: string): Promise<boolean> {
    const wallet = await this.getUserWallet(userId);
    return wallet !== null;
  }

  /**
   * Create wallet automatically for user if they don't have one
   */
  async ensureWalletExists(userId: string): Promise<{ wallet: UserWallet; isNewWallet: boolean }> {
    const existingWallet = await this.getUserWallet(userId);
    if (existingWallet) {
      return { wallet: existingWallet, isNewWallet: false };
    }

    const newWallet = await this.createWalletForUser(userId);
    return { wallet: newWallet, isNewWallet: true };
  }

  /**
   * Get transaction history for a user
   */
  async getTransactionHistory(userId: string): Promise<any[]> {
    try {
      logger.warn('getTransactionHistory() is not efficiently implemented with cache system. Consider maintaining a transaction index or using database queries.');
      // Note: This is not efficiently implemented with cache system
      // In a production system, you'd want to maintain a separate transaction index
      // or use database queries to get transaction history
      return [];
    } catch (error) {
      logger.error('Failed to get transaction history:', error);
      return [];
    }
  }
}