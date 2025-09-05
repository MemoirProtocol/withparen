import { type IAgentRuntime, logger, type UUID } from '@elizaos/core';

export interface UserTrustInfo {
  userId: UUID;
  walletAddress: string;
  trustTransactionHash: string;
  trustedAt: number;
  circlesGroupCA: string;
}

/**
 * Service to manage user trust status in Circles group
 * Tracks who has been trusted and prevents duplicate trust operations
 */
export class UserTrustStatusService {
  private runtime: IAgentRuntime;
  private tableName = 'user_trust_status';

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
  }

  /**
   * Check if a user has already been trusted in Paren's Circles group
   * @param userId - The user's entity ID
   * @returns True if user is already trusted, false otherwise
   */
  async isUserTrusted(userId: UUID): Promise<boolean> {
    try {
      const trustRecords = await this.runtime.getMemories({
        tableName: this.tableName,
        entityId: userId,
        count: 1,
      });

      const isTrusted = trustRecords.length > 0;
      logger.debug(`[user-trust] User ${userId} trust status: ${isTrusted}`);
      return isTrusted;
    } catch (error) {
      logger.error(
        `[user-trust] Error checking trust status for ${userId}:`,
        error instanceof Error ? error.message : String(error)
      );
      return false; // Assume not trusted on error to be safe
    }
  }

  /**
   * Record that a user has been successfully trusted
   * @param userId - The user's entity ID
   * @param walletAddress - The wallet address that was trusted
   * @param trustTransactionHash - The blockchain transaction hash
   * @param circlesGroupCA - The Circles group contract address
   * @param roomId - The room ID where this trust record should be stored (optional, defaults to userId)
   */
  async setUserTrusted(
    userId: UUID,
    walletAddress: string,
    trustTransactionHash: string,
    circlesGroupCA: string,
    roomId?: UUID
  ): Promise<void> {
    try {
      // Check if already exists to prevent duplicates
      const existingTrust = await this.isUserTrusted(userId);
      if (existingTrust) {
        logger.info(`[user-trust] User ${userId} already has trust record, updating...`);

        // Get existing record to update it
        const existingRecords = await this.runtime.getMemories({
          tableName: this.tableName,
          entityId: userId,
          count: 1,
        });

        if (existingRecords.length > 0 && existingRecords[0].id) {
          await this.runtime.updateMemory({
            id: existingRecords[0].id,
            content: {
              userId,
              walletAddress,
              trustTransactionHash,
              trustedAt: Date.now(),
              circlesGroupCA,
              type: 'user_trust_status',
            },
          });
          logger.info(`[user-trust] Updated trust record for user ${userId}`);
          return;
        }
      }

      // Create new trust record
      const trustRecord = {
        entityId: userId,
        agentId: this.runtime.agentId,
        roomId: roomId || this.runtime.agentId, // Use provided roomId or agent's roomId as fallback
        content: {
          userId,
          walletAddress,
          trustTransactionHash,
          trustedAt: Date.now(),
          circlesGroupCA,
          type: 'user_trust_status',
          text: `User ${userId} trusted with wallet ${walletAddress} at ${new Date().toISOString()}`,
        },
        createdAt: Date.now(),
      };

      await this.runtime.createMemory(trustRecord, this.tableName);
      logger.info(
        `[user-trust] Created trust record for user ${userId} with wallet ${walletAddress}`
      );
    } catch (error) {
      logger.error(
        `[user-trust] Error recording trust status for ${userId}:`,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  /**
   * Get detailed trust information for a user
   * @param userId - The user's entity ID
   * @returns Trust information or null if not trusted
   */
  async getUserTrustInfo(userId: UUID): Promise<UserTrustInfo | null> {
    try {
      const trustRecords = await this.runtime.getMemories({
        tableName: this.tableName,
        entityId: userId,
        count: 1,
      });

      if (trustRecords.length === 0) {
        return null;
      }

      const trustData = trustRecords[0].content as any;
      return {
        userId: trustData.userId,
        walletAddress: trustData.walletAddress,
        trustTransactionHash: trustData.trustTransactionHash,
        trustedAt: trustData.trustedAt,
        circlesGroupCA: trustData.circlesGroupCA,
      };
    } catch (error) {
      logger.error(
        `[user-trust] Error getting trust info for ${userId}:`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  }

  /**
   * Remove trust status for a user (for admin purposes)
   * @param userId - The user's entity ID
   */
  async removeUserTrust(userId: UUID): Promise<void> {
    try {
      const trustRecords = await this.runtime.getMemories({
        tableName: this.tableName,
        entityId: userId,
        count: 10, // Get all records for this user
      });

      for (const record of trustRecords) {
        if (record.id) {
          await this.runtime.deleteMemory(record.id);
        }
      }

      logger.info(`[user-trust] Removed trust records for user ${userId}`);
    } catch (error) {
      logger.error(
        `[user-trust] Error removing trust for ${userId}:`,
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  /**
   * Get all trusted users (for admin purposes)
   * @param limit - Maximum number of records to return
   */
  async getAllTrustedUsers(limit = 100): Promise<UserTrustInfo[]> {
    try {
      const trustRecords = await this.runtime.getMemories({
        tableName: this.tableName,
        count: limit,
      });

      return trustRecords.map((record) => {
        const trustData = record.content as any;
        return {
          userId: trustData.userId,
          walletAddress: trustData.walletAddress,
          trustTransactionHash: trustData.trustTransactionHash,
          trustedAt: trustData.trustedAt,
          circlesGroupCA: trustData.circlesGroupCA,
        };
      });
    } catch (error) {
      logger.error(
        '[user-trust] Error getting all trusted users:',
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }
}
