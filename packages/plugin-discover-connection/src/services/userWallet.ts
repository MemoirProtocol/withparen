import { type IAgentRuntime, logger, Service, ServiceType, type UUID } from '@elizaos/core';
import { CirclesUsersService, type UserStatusCheck } from './circlesUsers.js';

/**
 * User wallet record stored in memory
 */
interface UserWalletRecord {
  userId: UUID;
  walletAddress: string;
  circlesStatus: 'verified' | 'registered' | 'unregistered';
  incomingTrustCount: number;
  outgoingTrustCount: number;
  isVerified: boolean;
  trustsNeeded: number;
  lastStatusCheck: number;
  storedAt: number;
  trustTransactionHash?: string; // Only if trusted through joinGroup
  parenCirclesCA?: string; // Only if trusted through joinGroup
}

/**
 * Complete wallet information including Circles status
 */
export interface UserWalletInfo {
  walletAddress: string;
  circlesStatus: 'verified' | 'registered' | 'unregistered';
  incomingTrustCount: number;
  outgoingTrustCount: number;
  isVerified: boolean;
  trustsNeeded: number;
  lastStatusCheck: Date;
  storedAt: Date;
  trustTransactionHash?: string;
  parenCirclesCA?: string;
  isStale: boolean; // True if status needs refresh
}

/**
 * Service for managing user wallet addresses and their Circles network status
 * Provides centralized wallet storage and status tracking
 */
export class UserWalletService extends Service {
  private circlesUsersService?: CirclesUsersService;
  private readonly tableName = 'user_wallets';
  private readonly STATUS_CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

  static serviceType = ServiceType.DATABASE;

  constructor(runtime: IAgentRuntime) {
    super();
    this.runtime = runtime;
  }

  /**
   * Start the service
   */
  static async start(runtime: IAgentRuntime): Promise<Service> {
    const service = new UserWalletService(runtime);
    return service;
  }

  /**
   * Get or create CirclesUsersService instance
   */
  private getCirclesUsersService(): CirclesUsersService {
    if (!this.circlesUsersService) {
      this.circlesUsersService = new CirclesUsersService(this.runtime);
    }
    return this.circlesUsersService;
  }

  /**
   * Store or update a user's wallet address
   */
  async setUserWallet(
    userId: UUID,
    walletAddress: string,
    trustTransactionHash?: string,
    parenCirclesCA?: string
  ): Promise<void> {
    try {
      logger.info(`[user-wallet] Storing wallet address for user ${userId}: ${walletAddress}`);

      // Get current Circles status for the wallet
      const circlesService = this.getCirclesUsersService();
      const circlesStatus = await circlesService.checkUserStatus(walletAddress);

      // Check if user already has a wallet record
      const existingRecord = await this.getUserWalletRecord(userId);

      const walletRecord: UserWalletRecord = {
        userId,
        walletAddress,
        circlesStatus: this.mapCirclesStatus(circlesStatus),
        incomingTrustCount: circlesStatus.trustCount,
        outgoingTrustCount: 0, // We don't track outgoing trusts in checkUserStatus
        isVerified: circlesStatus.verified,
        trustsNeeded: circlesStatus.needsTrusts || 0,
        lastStatusCheck: Date.now(),
        storedAt: existingRecord?.storedAt || Date.now(),
        trustTransactionHash,
        parenCirclesCA,
      };

      if (existingRecord && existingRecord.id) {
        // Update existing record
        await this.runtime.updateMemory({
          id: existingRecord.id,
          content: {
            ...walletRecord,
            type: 'user_wallet',
            text: `User ${userId} wallet: ${walletAddress} (${walletRecord.circlesStatus})`,
          },
        });
        logger.info(`[user-wallet] Updated wallet record for user ${userId}`);
      } else {
        // Create new record
        const memoryRecord = {
          entityId: userId,
          agentId: this.runtime.agentId,
          roomId: userId, // Use userId as roomId for user-specific data
          content: {
            ...walletRecord,
            type: 'user_wallet',
            text: `User ${userId} wallet: ${walletAddress} (${walletRecord.circlesStatus})`,
          },
          createdAt: Date.now(),
        };

        await this.runtime.createMemory(memoryRecord, this.tableName);
        logger.info(`[user-wallet] Created wallet record for user ${userId}`);
      }
    } catch (error) {
      logger.error(`[user-wallet] Error storing wallet for user ${userId}: ${error}`);
      throw error;
    }
  }

  /**
   * Get stored wallet information for a user
   */
  async getUserWallet(userId: UUID): Promise<string | null> {
    try {
      const walletInfo = await this.getUserWalletWithStatus(userId);
      return walletInfo?.walletAddress || null;
    } catch (error) {
      logger.error(`[user-wallet] Error getting wallet for user ${userId}: ${error}`);
      return null;
    }
  }

  /**
   * Get complete wallet information including Circles status for a user
   */
  async getUserWalletWithStatus(
    userId: UUID,
    forceRefresh = false
  ): Promise<UserWalletInfo | null> {
    try {
      const walletRecord = await this.getUserWalletRecord(userId);

      if (!walletRecord) {
        // Try to migrate from legacy storage
        const legacyWallet = await this.migrateLegacyWalletData(userId);
        if (legacyWallet) {
          return legacyWallet;
        }
        return null;
      }

      const walletData = walletRecord.content as UserWalletRecord;
      const isStale =
        forceRefresh || Date.now() - walletData.lastStatusCheck > this.STATUS_CACHE_DURATION;

      // Refresh status if stale
      if (isStale) {
        logger.debug(`[user-wallet] Refreshing stale wallet status for user ${userId}`);

        const circlesService = this.getCirclesUsersService();
        const freshStatus = await circlesService.checkUserStatus(walletData.walletAddress);

        // Update the record with fresh status
        const updatedRecord: UserWalletRecord = {
          ...walletData,
          circlesStatus: this.mapCirclesStatus(freshStatus),
          incomingTrustCount: freshStatus.trustCount,
          isVerified: freshStatus.verified,
          trustsNeeded: freshStatus.needsTrusts || 0,
          lastStatusCheck: Date.now(),
        };

        if (walletRecord.id) {
          await this.runtime.updateMemory({
            id: walletRecord.id,
            content: {
              ...updatedRecord,
              type: 'user_wallet',
              text: `User ${userId} wallet: ${updatedRecord.walletAddress} (${updatedRecord.circlesStatus})`,
            },
          });
        }

        return {
          walletAddress: updatedRecord.walletAddress,
          circlesStatus: updatedRecord.circlesStatus,
          incomingTrustCount: updatedRecord.incomingTrustCount,
          outgoingTrustCount: updatedRecord.outgoingTrustCount,
          isVerified: updatedRecord.isVerified,
          trustsNeeded: updatedRecord.trustsNeeded,
          lastStatusCheck: new Date(updatedRecord.lastStatusCheck),
          storedAt: new Date(updatedRecord.storedAt),
          trustTransactionHash: updatedRecord.trustTransactionHash,
          parenCirclesCA: updatedRecord.parenCirclesCA,
          isStale: false,
        };
      }

      // Return cached data
      return {
        walletAddress: walletData.walletAddress,
        circlesStatus: walletData.circlesStatus,
        incomingTrustCount: walletData.incomingTrustCount,
        outgoingTrustCount: walletData.outgoingTrustCount,
        isVerified: walletData.isVerified,
        trustsNeeded: walletData.trustsNeeded,
        lastStatusCheck: new Date(walletData.lastStatusCheck),
        storedAt: new Date(walletData.storedAt),
        trustTransactionHash: walletData.trustTransactionHash,
        parenCirclesCA: walletData.parenCirclesCA,
        isStale,
      };
    } catch (error) {
      logger.error(`[user-wallet] Error getting wallet status for user ${userId}: ${error}`);
      return null;
    }
  }

  /**
   * Check if user has a stored wallet address
   */
  async hasUserWallet(userId: UUID): Promise<boolean> {
    try {
      const wallet = await this.getUserWallet(userId);
      return wallet !== null;
    } catch (error) {
      logger.error(`[user-wallet] Error checking if user has wallet: ${error}`);
      return false;
    }
  }

  /**
   * Remove wallet information for a user
   */
  async removeUserWallet(userId: UUID): Promise<boolean> {
    try {
      const walletRecord = await this.getUserWalletRecord(userId);

      if (walletRecord && walletRecord.id) {
        await this.runtime.deleteMemory(walletRecord.id);
        logger.info(`[user-wallet] Removed wallet record for user ${userId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`[user-wallet] Error removing wallet for user ${userId}: ${error}`);
      return false;
    }
  }

  /**
   * Force refresh of Circles status for a user's wallet
   */
  async refreshWalletStatus(userId: UUID): Promise<UserWalletInfo | null> {
    return await this.getUserWalletWithStatus(userId, true);
  }

  /**
   * Get the raw wallet record from memory
   */
  private async getUserWalletRecord(userId: UUID): Promise<any> {
    try {
      const records = await this.runtime.getMemories({
        tableName: this.tableName,
        entityId: userId,
        count: 1,
      });

      return records.length > 0 ? records[0] : null;
    } catch (error) {
      logger.error(`[user-wallet] Error getting wallet record for user ${userId}: ${error}`);
      return null;
    }
  }

  /**
   * Map UserStatusCheck to our internal status format
   */
  private mapCirclesStatus(status: UserStatusCheck): 'verified' | 'registered' | 'unregistered' {
    if (!status.found) return 'unregistered';
    if (status.verified) return 'verified';
    return 'registered';
  }

  /**
   * Attempt to migrate legacy wallet data from other storage locations
   */
  private async migrateLegacyWalletData(userId: UUID): Promise<UserWalletInfo | null> {
    try {
      logger.debug(`[user-wallet] Attempting to migrate legacy wallet data for user ${userId}`);

      // Check user_trust_status table first (most reliable)
      const trustRecords = await this.runtime.getMemories({
        tableName: 'user_trust_status',
        entityId: userId,
        count: 1,
      });

      if (trustRecords.length > 0) {
        const trustData = trustRecords[0].content as any;
        if (trustData.walletAddress) {
          logger.info(`[user-wallet] Migrating wallet from user_trust_status for user ${userId}`);

          await this.setUserWallet(
            userId,
            trustData.walletAddress,
            trustData.trustTransactionHash,
            trustData.circlesGroupCA
          );

          return await this.getUserWalletWithStatus(userId);
        }
      }

      // Check memories table for wallet_address type
      const memoryRecords = await this.runtime.getMemories({
        tableName: 'memories',
        entityId: userId,
        count: 10, // Check multiple records
      });

      const walletRecord = memoryRecords.find(
        (record) => record.content.type === 'wallet_address' && record.content.walletAddress
      );

      if (walletRecord) {
        const walletData = walletRecord.content as any;
        logger.info(`[user-wallet] Migrating wallet from memories for user ${userId}`);

        await this.setUserWallet(
          userId,
          walletData.walletAddress,
          walletData.trustTransactionHash,
          walletData.parenCirclesCA
        );

        return await this.getUserWalletWithStatus(userId);
      }

      logger.debug(`[user-wallet] No legacy wallet data found for user ${userId}`);
      return null;
    } catch (error) {
      logger.error(`[user-wallet] Error migrating legacy wallet data for user ${userId}: ${error}`);
      return null;
    }
  }

  /**
   * Get statistics about stored wallets
   */
  async getWalletStatistics(): Promise<{
    totalWallets: number;
    verifiedWallets: number;
    registeredWallets: number;
    unregisteredWallets: number;
  }> {
    try {
      const allRecords = await this.runtime.getMemories({
        tableName: this.tableName,
        count: 1000,
      });

      const stats = {
        totalWallets: allRecords.length,
        verifiedWallets: 0,
        registeredWallets: 0,
        unregisteredWallets: 0,
      };

      for (const record of allRecords) {
        const walletData = record.content as UserWalletRecord;
        switch (walletData.circlesStatus) {
          case 'verified':
            stats.verifiedWallets++;
            break;
          case 'registered':
            stats.registeredWallets++;
            break;
          case 'unregistered':
            stats.unregisteredWallets++;
            break;
        }
      }

      return stats;
    } catch (error) {
      logger.error(`[user-wallet] Error getting wallet statistics: ${error}`);
      return {
        totalWallets: 0,
        verifiedWallets: 0,
        registeredWallets: 0,
        unregisteredWallets: 0,
      };
    }
  }
}
