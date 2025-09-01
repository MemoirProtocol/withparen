import { type IAgentRuntime, logger, type UUID } from '@elizaos/core';

export interface QuotaInfo {
  userId: UUID;
  totalProposals: number;
  dailyProposals: number;
  lastProposalDate: number;
  lastResetDate: number;
  remainingTotal?: number; // For non-trusted users
  remainingDaily?: number; // For trusted users
}

export interface QuotaConfig {
  nonMemberTotalLimit: number;
  memberDailyLimit: number;
}

/**
 * Service to manage proposal quotas for users
 * Non-members: Limited to N total proposals
 * Members (trusted): Limited to N proposals per day
 */
export class ProposalQuotaService {
  private runtime: IAgentRuntime;
  private tableName = 'proposal_quotas';
  private config: QuotaConfig;

  constructor(runtime: IAgentRuntime, config?: Partial<QuotaConfig>) {
    this.runtime = runtime;
    this.config = {
      nonMemberTotalLimit: 3,
      memberDailyLimit: 1,
      ...config,
    };

    logger.info(`[proposal-quota] Initialized with config:`, this.config);
  }

  /**
   * Check if a user can send a proposal based on their quota
   * @param userId - The user's entity ID
   * @param isTrusted - Whether the user is trusted/member
   * @returns True if user can send proposal, false if quota exceeded
   */
  async canSendProposal(userId: UUID, isTrusted: boolean): Promise<boolean> {
    try {
      const quotaInfo = await this.getQuotaInfo(userId, isTrusted);

      if (isTrusted) {
        // For trusted members: Check daily limit
        const canSendDaily = quotaInfo.remainingDaily! > 0;
        logger.debug(
          `[proposal-quota] Member ${userId} can send proposal: ${canSendDaily} (remaining daily: ${quotaInfo.remainingDaily})`
        );
        return canSendDaily;
      } else {
        // For non-members: Check total limit
        const canSendTotal = quotaInfo.remainingTotal! > 0;
        logger.debug(
          `[proposal-quota] Non-member ${userId} can send proposal: ${canSendTotal} (remaining total: ${quotaInfo.remainingTotal})`
        );
        return canSendTotal;
      }
    } catch (error) {
      logger.error(`[proposal-quota] Error checking quota for ${userId}:`, error);
      return false; // Assume no quota available on error
    }
  }

  /**
   * Record that a user has sent a proposal (decrement their quota)
   * @param userId - The user's entity ID
   * @param isTrusted - Whether the user is trusted/member
   */
  async recordProposal(userId: UUID, isTrusted: boolean): Promise<void> {
    try {
      const quotaInfo = await this.getQuotaInfo(userId, isTrusted);
      const now = Date.now();

      // Update counters
      const updatedQuota = {
        ...quotaInfo,
        totalProposals: quotaInfo.totalProposals + 1,
        dailyProposals: quotaInfo.dailyProposals + 1,
        lastProposalDate: now,
      };

      await this.saveQuotaInfo(updatedQuota);
      logger.info(
        `[proposal-quota] Recorded proposal for ${isTrusted ? 'member' : 'non-member'} ${userId}`
      );
    } catch (error) {
      logger.error(`[proposal-quota] Error recording proposal for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get quota information for a user
   * @param userId - The user's entity ID
   * @param isTrusted - Whether the user is trusted/member
   * @returns Quota information including remaining allowances
   */
  async getQuotaInfo(userId: UUID, isTrusted: boolean): Promise<QuotaInfo> {
    try {
      const quotaRecords = await this.runtime.getMemories({
        tableName: this.tableName,
        entityId: userId,
        count: 1,
      });

      let quotaInfo: QuotaInfo;

      if (quotaRecords.length === 0) {
        // Create new quota record
        quotaInfo = {
          userId,
          totalProposals: 0,
          dailyProposals: 0,
          lastProposalDate: 0,
          lastResetDate: Date.now(),
        };
      } else {
        // Load existing quota
        const quotaData = quotaRecords[0].content as any;
        quotaInfo = {
          userId: quotaData.userId,
          totalProposals: quotaData.totalProposals || 0,
          dailyProposals: quotaData.dailyProposals || 0,
          lastProposalDate: quotaData.lastProposalDate || 0,
          lastResetDate: quotaData.lastResetDate || Date.now(),
        };
      }

      // Check if we need to reset daily counter
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const timeSinceLastReset = now - quotaInfo.lastResetDate;

      if (timeSinceLastReset >= oneDayMs) {
        // Reset daily counter
        quotaInfo.dailyProposals = 0;
        quotaInfo.lastResetDate = now;
        logger.debug(`[proposal-quota] Reset daily counter for user ${userId}`);
      }

      // Calculate remaining quotas
      if (isTrusted) {
        quotaInfo.remainingDaily = Math.max(
          0,
          this.config.memberDailyLimit - quotaInfo.dailyProposals
        );
      } else {
        quotaInfo.remainingTotal = Math.max(
          0,
          this.config.nonMemberTotalLimit - quotaInfo.totalProposals
        );
      }

      return quotaInfo;
    } catch (error) {
      logger.error(`[proposal-quota] Error getting quota info for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Save quota information to memory
   */
  private async saveQuotaInfo(quotaInfo: QuotaInfo): Promise<void> {
    try {
      const quotaRecords = await this.runtime.getMemories({
        tableName: this.tableName,
        entityId: quotaInfo.userId,
        count: 1,
      });

      const quotaContent = {
        userId: quotaInfo.userId,
        totalProposals: quotaInfo.totalProposals,
        dailyProposals: quotaInfo.dailyProposals,
        lastProposalDate: quotaInfo.lastProposalDate,
        lastResetDate: quotaInfo.lastResetDate,
        type: 'proposal_quota',
        text: `Proposal quota for user ${quotaInfo.userId}: total=${quotaInfo.totalProposals}, daily=${quotaInfo.dailyProposals}`,
      };

      if (quotaRecords.length > 0 && quotaRecords[0].id) {
        // Update existing record
        await this.runtime.updateMemory({
          id: quotaRecords[0].id,
          content: quotaContent,
        });
      } else {
        // Create new record
        const quotaRecord = {
          entityId: quotaInfo.userId,
          agentId: this.runtime.agentId,
          roomId: quotaInfo.userId, // Use userId as roomId for user-specific data
          content: quotaContent,
          createdAt: Date.now(),
        };

        await this.runtime.createMemory(quotaRecord, this.tableName);
      }
    } catch (error) {
      logger.error(`[proposal-quota] Error saving quota info:`, error);
      throw error;
    }
  }

  /**
   * Reset quota for a user (admin function)
   * @param userId - The user's entity ID
   */
  async resetUserQuota(userId: UUID): Promise<void> {
    try {
      const resetQuota: QuotaInfo = {
        userId,
        totalProposals: 0,
        dailyProposals: 0,
        lastProposalDate: 0,
        lastResetDate: Date.now(),
      };

      await this.saveQuotaInfo(resetQuota);
      logger.info(`[proposal-quota] Reset quota for user ${userId}`);
    } catch (error) {
      logger.error(`[proposal-quota] Error resetting quota for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get quota configuration
   */
  getConfig(): QuotaConfig {
    return this.config;
  }

  /**
   * Update quota configuration
   */
  updateConfig(newConfig: Partial<QuotaConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info(`[proposal-quota] Updated config:`, this.config);
  }

  /**
   * Get user's quota status message for display
   * @param userId - The user's entity ID
   * @param isTrusted - Whether the user is trusted/member
   * @returns Human-readable quota status
   */
  async getQuotaStatusMessage(userId: UUID, isTrusted: boolean): Promise<string> {
    try {
      const quotaInfo = await this.getQuotaInfo(userId, isTrusted);

      if (isTrusted) {
        return `As a Circles member, you can send ${quotaInfo.remainingDaily} more introduction request${quotaInfo.remainingDaily !== 1 ? 's' : ''} today.`;
      } else {
        return `You have ${quotaInfo.remainingTotal} introduction request${quotaInfo.remainingTotal !== 1 ? 's' : ''} remaining. Join our Circles group to get daily requests!`;
      }
    } catch (error) {
      logger.error(`[proposal-quota] Error getting status message for ${userId}:`, error);
      return 'Unable to check quota status.';
    }
  }
}
