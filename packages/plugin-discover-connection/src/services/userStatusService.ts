import { type IAgentRuntime, type UUID, logger } from '@elizaos/core';

/**
 * User Status Enumeration
 * Represents the user's membership level in the Discover-Connection system
 */
export enum UserStatus {
  ONBOARDING = 'onboarding', // User in discovery phase, going through onboarding
  UNVERIFIED_MEMBER = 'unverified_member', // Completed onboarding but not Circles verified
  VERIFICATION_PENDING = 'verification_pending', // Provided verification info, can send proposals, awaiting full verification
  GROUP_MEMBER = 'group_member', // Circles verified and part of Paren's network
}

/**
 * Match Status Enumeration
 * Represents the state of a connection match workflow
 */
export enum MatchStatus {
  MATCH_FOUND = 'match_found', // Match discovered, awaiting user decision
  PROPOSAL_PENDING = 'proposal_pending', // Introduction requested, awaiting response
  ACCEPTED = 'accepted', // Both parties accepted
  DECLINED = 'declined', // Connection declined
  CONNECTED = 'connected', // Active connection established
}

/**
 * User Status Service
 * Manages user membership status and transitions within the Discover-Connection system
 */
export class UserStatusService {
  private runtime: IAgentRuntime;

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
  }

  /**
   * Get the current status of a user
   */
  async getUserStatus(userId: UUID): Promise<UserStatus> {
    try {
      const userStatusRecords = await this.runtime.getMemories({
        tableName: 'user_status',
        entityId: userId,
        count: 1,
      });

      if (userStatusRecords.length === 0) {
        // New user - initialize with onboarding status
        await this.setUserStatus(userId, UserStatus.ONBOARDING);
        return UserStatus.ONBOARDING;
      }

      const currentStatus = userStatusRecords[0].content.status as UserStatus;
      return currentStatus;
    } catch (error) {
      logger.error(
        `[discover-connection] UserStatusService: Error getting user status for ${userId}: ${error}`
      );
      // Default to onboarding for safety
      return UserStatus.ONBOARDING;
    }
  }

  /**
   * Set the status of a user
   */
  async setUserStatus(userId: UUID, status: UserStatus): Promise<void> {
    try {
      // Check if user already has a status record
      const existingRecords = await this.runtime.getMemories({
        tableName: 'user_status',
        entityId: userId,
        count: 1,
      });

      if (existingRecords.length > 0) {
        // Update existing record
        const existingRecord = existingRecords[0];
        if (existingRecord.id) {
          const updatedContent = {
            ...existingRecord.content,
            status,
            updatedAt: Date.now(),
            previousStatus: existingRecord.content.status,
          };

          await this.runtime.updateMemory({
            id: existingRecord.id,
            content: updatedContent,
          });

          logger.info(
            `[discover-connection] UserStatusService: Updated user ${userId} status from ${existingRecord.content.status} to ${status}`
          );
        }
      } else {
        // Create new record
        const statusRecord = {
          entityId: userId,
          agentId: this.runtime.agentId,
          roomId: userId, // For DMs, roomId equals userId
          content: {
            status,
            text: `User status: ${status}`,
            type: 'user_status',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          createdAt: Date.now(),
        };

        await this.runtime.createMemory(statusRecord, 'user_status');
        logger.info(
          `[discover-connection] UserStatusService: Created initial status ${status} for user ${userId}`
        );
      }
    } catch (error) {
      logger.error(
        `[discover-connection] UserStatusService: Error setting user status for ${userId} to ${status}: ${error}`
      );
      throw error;
    }
  }

  /**
   * Transition user status with validation
   */
  async transitionUserStatus(userId: UUID, newStatus: UserStatus): Promise<boolean> {
    try {
      const currentStatus = await this.getUserStatus(userId);

      // Validate transition
      const isValidTransition = this.isValidStatusTransition(currentStatus, newStatus);

      if (!isValidTransition) {
        logger.warn(
          `[discover-connection] UserStatusService: Invalid status transition for user ${userId}: ${currentStatus} -> ${newStatus}`
        );
        return false;
      }

      await this.setUserStatus(userId, newStatus);
      return true;
    } catch (error) {
      logger.error(
        `[discover-connection] UserStatusService: Error transitioning user status for ${userId}: ${error}`
      );
      return false;
    }
  }

  /**
   * Check if a status transition is valid
   */
  private isValidStatusTransition(currentStatus: UserStatus, newStatus: UserStatus): boolean {
    // Define allowed transitions
    const allowedTransitions: Record<UserStatus, UserStatus[]> = {
      [UserStatus.ONBOARDING]: [UserStatus.UNVERIFIED_MEMBER, UserStatus.GROUP_MEMBER],
      [UserStatus.UNVERIFIED_MEMBER]: [
        UserStatus.VERIFICATION_PENDING,
        UserStatus.GROUP_MEMBER,
        UserStatus.ONBOARDING,
      ], // Allow back to onboarding if needed
      [UserStatus.VERIFICATION_PENDING]: [UserStatus.GROUP_MEMBER], // Can only move to group member once verified
      [UserStatus.GROUP_MEMBER]: [], // Group members typically don't transition back
    };

    return allowedTransitions[currentStatus]?.includes(newStatus) || currentStatus === newStatus;
  }

  /**
   * Check if user can perform a specific action based on their status
   */
  async canUserPerformAction(userId: UUID, requiredStatus: UserStatus): Promise<boolean> {
    try {
      const currentStatus = await this.getUserStatus(userId);
      return this.isStatusSufficientForAction(currentStatus, requiredStatus);
    } catch (error) {
      logger.error(
        `[discover-connection] UserStatusService: Error checking action permission for user ${userId}: ${error}`
      );
      return false;
    }
  }

  /**
   * Check if current status is sufficient for required status
   */
  private isStatusSufficientForAction(
    currentStatus: UserStatus,
    requiredStatus: UserStatus
  ): boolean {
    // Define status hierarchy (higher number = higher access level)
    const statusHierarchy = {
      [UserStatus.ONBOARDING]: 1,
      [UserStatus.UNVERIFIED_MEMBER]: 2,
      [UserStatus.VERIFICATION_PENDING]: 3,
      [UserStatus.GROUP_MEMBER]: 4,
    };

    return statusHierarchy[currentStatus] >= statusHierarchy[requiredStatus];
  }

  /**
   * Check if user has completed onboarding (has persona/connection data)
   */
  async hasCompletedOnboarding(userId: UUID, roomId: UUID): Promise<boolean> {
    try {
      // Define persona and connection dimension tables
      const personaDimensions = [
        'persona_demographic',
        'persona_characteristic',
        'persona_routine',
        'persona_goal',
        'persona_experience',
        'persona_persona_relationship',
        'persona_emotional_state',
      ];

      const connectionDimensions = [
        'connection_desired_type',
        'connection_desired_background',
        'connection_desired_goals',
        'connection_desired_experience',
        'connection_desired_communication',
        'connection_desired_value',
      ];

      // Check for at least 1 memory in any persona dimension
      let hasPersonaData = false;
      for (const tableName of personaDimensions) {
        try {
          const memories = await this.runtime.getMemories({
            entityId: userId,
            roomId,
            tableName,
            count: 1,
          });
          if (memories.length > 0) {
            hasPersonaData = true;
            break;
          }
        } catch (error) {
          // Continue checking other tables if one fails
        }
      }

      // Check for at least 1 memory in any connection dimension
      let hasConnectionData = false;
      for (const tableName of connectionDimensions) {
        try {
          const memories = await this.runtime.getMemories({
            entityId: userId,
            roomId,
            tableName,
            count: 1,
          });
          if (memories.length > 0) {
            hasConnectionData = true;
            break;
          }
        } catch (error) {
          // Continue checking other tables if one fails
        }
      }

      const hasCompletedOnboarding = hasPersonaData && hasConnectionData;
      return hasCompletedOnboarding;
    } catch (error) {
      logger.error(
        `[discover-connection] UserStatusService: Error checking onboarding completion for ${userId}: ${error}`
      );
      return false;
    }
  }

  /**
   * Get all users with a specific status
   */
  async getUsersByStatus(status: UserStatus, count: number = 50): Promise<UUID[]> {
    try {
      const statusRecords = await this.runtime.getMemories({
        tableName: 'user_status',
        count,
      });

      const usersWithStatus = statusRecords
        .filter((record) => record.content.status === status)
        .map((record) => record.entityId);

      return usersWithStatus;
    } catch (error) {
      logger.error(
        `[discover-connection] UserStatusService: Error getting users by status ${status}: ${error}`
      );
      return [];
    }
  }

  /**
   * Get detailed status information for debugging
   */
  async getUserStatusInfo(userId: UUID): Promise<{
    status: UserStatus;
    hasOnboardingData: boolean;
    isGroupMember: boolean;
    statusHistory?: any[];
  }> {
    try {
      const status = await this.getUserStatus(userId);
      const hasOnboardingData = await this.hasCompletedOnboarding(userId, userId);
      const isGroupMember = status === UserStatus.GROUP_MEMBER;

      // Get status history if available
      const statusHistory = await this.runtime.getMemories({
        tableName: 'user_status',
        entityId: userId,
        count: 10,
      });

      return {
        status,
        hasOnboardingData,
        isGroupMember,
        statusHistory: statusHistory.map((record) => ({
          status: record.content.status,
          previousStatus: record.content.previousStatus,
          updatedAt: record.content.updatedAt,
        })),
      };
    } catch (error) {
      logger.error(
        `[discover-connection] UserStatusService: Error getting status info for ${userId}: ${error}`
      );
      return {
        status: UserStatus.ONBOARDING,
        hasOnboardingData: false,
        isGroupMember: false,
      };
    }
  }
}
