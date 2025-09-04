import {
  type IAgentRuntime,
  type Memory,
  type Action,
  type State,
  type ActionExample,
  type HandlerCallback,
  type ActionResult,
  logger,
  ModelType,
  parseKeyValueXml,
} from '@elizaos/core';

import {
  introductionProposalTemplate,
  introductionTrustInviteTemplate,
} from '../utils/promptTemplates.js';
import { ProposalQuotaService } from '../services/proposalQuota.js';
import { UserStatusService, UserStatus, MatchStatus } from '../services/userStatusService.js';

/**
 * Introduction Proposal Action for Discover-Connection
 * Handles sending introduction proposals to potential matches
 */
export const introProposalAction: Action = {
  name: 'INTRO_PROPOSAL',
  description:
    'Sends introduction proposals to matches with MATCH_FOUND status. Requires user to have VERIFICATION_PENDING or GROUP_MEMBER status (provided verification info).',
  similes: [
    'SEND_INTRODUCTION',
    'PROPOSE_INTRO',
    'REQUEST_INTRODUCTION',
    'MAKE_INTRODUCTION',
    'CONNECT_USERS',
  ],
  examples: [] as ActionExample[][],

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    try {
      // Check if user has provided verification data (VERIFICATION_PENDING or GROUP_MEMBER)
      const userStatusService = new UserStatusService(runtime);
      const userStatus = await userStatusService.getUserStatus(message.entityId);

      if (
        userStatus !== UserStatus.VERIFICATION_PENDING &&
        userStatus !== UserStatus.GROUP_MEMBER
      ) {
        return false;
      }

      // Check if user has matches with MATCH_FOUND status (ready for proposal)
      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 50,
      });

      const readyMatches = matches.filter((match) => {
        const matchData = match.content as any;
        return (
          (matchData.user1Id === message.entityId || matchData.user2Id === message.entityId) &&
          matchData.status === MatchStatus.MATCH_FOUND
        );
      });

      if (readyMatches.length === 0) {
        return false;
      }

      // Check quota before validation passes
      try {
        const quotaService = new ProposalQuotaService(runtime);
        const canSendProposal = await quotaService.canSendProposal(message.entityId, userStatus);

        if (!canSendProposal) {
          return false;
        }
      } catch (quotaError) {
        logger.error(`[discover-connection] Error checking quota: ${quotaError}`);
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`[discover-connection] Error validating intro proposal action: ${error}`);
      return false;
    }
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      logger.info(
        `[discover-connection] Processing introduction proposal for user ${message.entityId}`
      );

      // Check quota and user status first
      const userStatusService = new UserStatusService(runtime);
      const userStatus = await userStatusService.getUserStatus(message.entityId);

      const quotaService = new ProposalQuotaService(runtime);
      const canSendProposal = await quotaService.canSendProposal(message.entityId, userStatus);

      if (!canSendProposal) {
        const quotaStatus = await quotaService.getQuotaStatusMessage(message.entityId, userStatus);
        const quotaErrorText = `You've reached your introduction request limit. ${quotaStatus}`;

        if (callback) {
          await callback({
            text: quotaErrorText,
            actions: ['REPLY'],
          });
        }

        return {
          text: quotaErrorText,
          success: false,
          error: new Error('Proposal quota exceeded'),
        };
      }

      // Get matches with MATCH_FOUND status for this user
      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 50,
      });

      const pendingMatches = matches.filter((match) => {
        const matchData = match.content as any;
        return (
          (matchData.user1Id === message.entityId || matchData.user2Id === message.entityId) &&
          matchData.status === MatchStatus.MATCH_FOUND
        );
      });

      if (pendingMatches.length === 0) {
        const noMatchText =
          "I don't see any pending matches ready for introduction right now. Would you like me to search for new connections?";

        if (callback) {
          await callback({
            text: noMatchText,
            actions: ['REPLY'],
          });
        }

        return {
          text: noMatchText,
          success: false,
          error: new Error('No pending matches found'),
        };
      }

      // Take the most recent match for introduction
      const matchToProcess = pendingMatches[0];
      const matchData = matchToProcess.content as any;

      // Determine who is the requesting user and who is the target
      const isUser1 = matchData.user1Id === message.entityId;
      const targetUserId = isUser1 ? matchData.user2Id : matchData.user1Id;
      const requestingUserId = message.entityId;

      logger.info(
        `[discover-connection] Processing introduction: ${requestingUserId} -> ${targetUserId}`
      );

      // Get contexts from the stored match record to avoid confusion
      // isUser1 already defined above

      // For introduction message TO the target:
      // - We need the requesting user's persona (who they are)
      // - We need the target user's connection preferences (what they're looking for)
      const requestingPersonaContext = isUser1
        ? matchData.user1PersonaContext || matchData.personaContext || 'Not available'
        : matchData.user2PersonaContext || 'Not available';

      const targetConnectionContext = isUser1
        ? matchData.user2ConnectionContext || 'Not specified'
        : matchData.user1ConnectionContext || matchData.connectionContext || 'Not specified';

      // Check if requesting user is a group member to determine which template to use
      const isRequestingUserGroupMember = userStatus === UserStatus.GROUP_MEMBER;

      let prompt: string;

      if (isRequestingUserGroupMember) {
        // User is already a group member - use standard introduction template
        logger.debug(
          `[discover-connection] Using standard introduction template for group member ${requestingUserId}`
        );
        prompt = introductionProposalTemplate
          .replace('{{requestingUserPersona}}', requestingPersonaContext || 'Not available')
          .replace('{{targetUserDesiredConnection}}', targetConnectionContext || 'Not specified')
          .replace('{{compatibilityScore}}', (matchData.compatibilityScore || 0).toString())
          .replace(
            '{{compatibilityReasoning}}',
            matchData.reasoning || 'Good compatibility detected'
          );
      } else {
        // User is not a group member - use trust invite template with verification data
        logger.debug(
          `[discover-connection] Using trust invite template for non-group member ${requestingUserId}`
        );

        // Fetch verification data for the requesting user
        const verificationRecords = await runtime.getMemories({
          tableName: 'circles_verification',
          entityId: requestingUserId,
          count: 1,
        });

        let verificationInfo = 'Verification information not available';

        if (verificationRecords.length > 0) {
          const verificationData = verificationRecords[0].content as any;
          let verificationParts: string[] = [];

          // Only include Metri account if it exists and is not placeholder text
          if (
            verificationData.metriAccount &&
            verificationData.metriAccount !== 'Not provided' &&
            verificationData.metriAccount !== 'None provided' &&
            verificationData.metriAccount.trim() !== ''
          ) {
            verificationParts.push(`Metri Account: ${verificationData.metriAccount}`);
          }

          // Only include social links if they exist and are not placeholder text
          if (
            verificationData.socialLinks &&
            verificationData.socialLinks.length > 0 &&
            !verificationData.socialLinks.some(
              (link: string) =>
                link === 'Not provided' || link === 'None provided' || link.trim() === ''
            )
          ) {
            const validLinks = verificationData.socialLinks.filter(
              (link: string) =>
                link && link !== 'Not provided' && link !== 'None provided' && link.trim() !== ''
            );
            if (validLinks.length > 0) {
              verificationParts.push(`Social Links: ${validLinks.join(', ')}`);
            }
          }

          if (verificationParts.length > 0) {
            verificationInfo = verificationParts.join('\n');
          }
        }

        prompt = introductionTrustInviteTemplate
          .replace('{{requestingUserPersona}}', requestingPersonaContext || 'Not available')
          .replace('{{verificationInfo}}', verificationInfo)
          .replace('{{targetUserDesiredConnection}}', targetConnectionContext || 'Not specified')
          .replace('{{compatibilityScore}}', (matchData.compatibilityScore || 0).toString())
          .replace(
            '{{compatibilityReasoning}}',
            matchData.reasoning || 'Good compatibility detected'
          );
      }

      const response = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt,
      });

      const parsedResponse = parseKeyValueXml(response);

      if (!parsedResponse || !parsedResponse.introductionMessage) {
        logger.error('[discover-connection] Failed to generate introduction message');
        const errorText =
          'I had trouble generating the introduction message. Let me try a different approach.';

        if (callback) {
          await callback({
            text: errorText,
            actions: ['REPLY'],
          });
        }

        return {
          text: errorText,
          success: false,
          error: new Error('Failed to generate introduction message'),
        };
      }

      const introductionMessage = parsedResponse.introductionMessage;

      // Create introduction record in the introductions table
      const introductionRecord = {
        entityId: requestingUserId,
        agentId: runtime.agentId,
        roomId: message.roomId,
        content: {
          text: `Introduction proposal from ${requestingUserId} to ${targetUserId}`,
          type: 'introduction_proposal',
          fromUserId: requestingUserId,
          toUserId: targetUserId,
          matchId: matchToProcess.id,
          introductionMessage,
          status: 'proposal_sent',
          proposalInitiator: requestingUserId, // Track initiator in introduction record
        },
        createdAt: Date.now(),
      };

      await runtime.createMemory(introductionRecord, 'introductions');

      // Update match status to PROPOSAL_PENDING for the requesting user
      if (matchToProcess.id) {
        const updatedMatchContent = {
          ...matchData,
          status: MatchStatus.PROPOSAL_PENDING,
        };

        await runtime.updateMemory({
          id: matchToProcess.id,
          content: updatedMatchContent,
        });

        logger.info(
          `[discover-connection] DEBUG - INTRO_PROPOSAL Updated match status: ${matchData.user1Id} <-> ${matchData.user2Id} from "${matchData.status}" to "${MatchStatus.PROPOSAL_PENDING}" (initiator: ${requestingUserId})`
        );
      }

      // Check if target user already has a match record with the requesting user
      const allMatches = await runtime.getMemories({
        tableName: 'matches',
        count: 100,
      });

      // Note: We already updated the main match record to PROPOSAL_PENDING above.
      // We need to ensure there's a corresponding match record for the target user.
      const existingTargetMatch = allMatches.find((match) => {
        const matchContent = match.content as any;
        return (
          match.id !== matchToProcess.id && // Don't find the same record we just updated
          ((matchContent.user1Id === targetUserId && matchContent.user2Id === requestingUserId) ||
            (matchContent.user1Id === requestingUserId && matchContent.user2Id === targetUserId))
        );
      });

      if (existingTargetMatch?.id) {
        // Update existing match status to PROPOSAL_PENDING as well
        logger.info(
          `[discover-connection] DEBUG - INTRO_PROPOSAL Found existing match ${existingTargetMatch.id}, updating status to PROPOSAL_PENDING`
        );

        const existingMatchData = existingTargetMatch.content as any;
        const updatedExistingMatchContent = {
          ...existingMatchData,
          status: MatchStatus.PROPOSAL_PENDING,
          proposalInitiator: requestingUserId, // Same initiator for both records
        };

        await runtime.updateMemory({
          id: existingTargetMatch.id,
          content: updatedExistingMatchContent,
        });

        logger.info(
          `[discover-connection] DEBUG - INTRO_PROPOSAL Updated existing match status for target user ${targetUserId}`
        );
      } else {
        // Create a match record for the target user to prevent them from getting the same match
        logger.info(
          `[discover-connection] DEBUG - INTRO_PROPOSAL No existing match found, creating new match record for target user ${targetUserId}`
        );

        const targetMatchRecord = {
          entityId: targetUserId,
          agentId: runtime.agentId,
          roomId: targetUserId, // For DMs, roomId equals the target user's entityId
          content: {
            text: `Match found between ${targetUserId} and ${requestingUserId} with compatibility score ${matchData.compatibilityScore}`,
            type: 'match_record',
            user1Id: targetUserId,
            user2Id: requestingUserId,
            compatibilityScore: matchData.compatibilityScore,
            reasoning: matchData.reasoning,
            status: MatchStatus.PROPOSAL_PENDING, // Both users have same status but different roles
            proposalInitiator: requestingUserId, // Track who initiated
            // Store contexts properly - no confusing swaps
            user1PersonaContext: isUser1
              ? matchData.user2PersonaContext
              : matchData.user1PersonaContext,
            user1ConnectionContext: isUser1
              ? matchData.user2ConnectionContext
              : matchData.user1ConnectionContext,
            user2PersonaContext: isUser1
              ? matchData.user1PersonaContext
              : matchData.user2PersonaContext,
            user2ConnectionContext: isUser1
              ? matchData.user1ConnectionContext
              : matchData.user2ConnectionContext,
            // Keep old fields for backward compatibility
            personaContext: isUser1
              ? matchData.user2PersonaContext || 'Not available'
              : matchData.user1PersonaContext || matchData.personaContext || 'Not available',
            connectionContext: isUser1
              ? matchData.user2ConnectionContext || 'Not specified'
              : matchData.user1ConnectionContext || matchData.connectionContext || 'Not specified',
          },
          createdAt: Date.now(),
        };

        await runtime.createMemory(targetMatchRecord, 'matches');
        logger.info(
          `[discover-connection] DEBUG - INTRO_PROPOSAL Created new target match record for user ${targetUserId}`
        );
      }

      // Send introduction message to target user
      try {
        // Find the target user's room to get routing information
        const targetRooms = await runtime.getMemories({
          tableName: 'rooms',
          count: 10,
        });

        // Look for a room where the target user is the main entity (DM room)
        let targetRoom: Memory | undefined = undefined;
        for (const room of targetRooms) {
          const roomData = room.content as any;
          // In Discover-Connection plugin, DM rooms typically have the user's entityId as roomId
          if (room.entityId === targetUserId || roomData?.participants?.includes(targetUserId)) {
            targetRoom = room;
            break;
          }
        }

        // For DMs, roomId should always equal the target user's entityId
        const targetInfo = {
          source: targetRoom?.content?.source || 'telegram', // Fallback to telegram if no room source
          roomId: targetUserId, // CRITICAL: For DMs, roomId = target user's entityId
          entityId: targetUserId,
        };

        // Send the introduction message to the target user
        await runtime.sendMessageToTarget(targetInfo, {
          text: introductionMessage,
          source: 'agent_introduction',
          type: 'introduction_proposal',
        });

        logger.info(
          `[discover-connection] Successfully sent introduction message to user ${targetUserId} with roomId ${targetUserId}`
        );

        // Log message content sent to user
        logger.info(
          `[discover-connection] MESSAGE_SENT_TO_USER: User ${targetUserId} received introduction message: "${introductionMessage.substring(0, 100)}${introductionMessage.length > 100 ? '...' : ''}"`
        );
      } catch (messageError) {
        logger.error(
          `[discover-connection] Failed to send introduction message to user ${targetUserId}: ${messageError}`
        );
        // Continue with the workflow even if message delivery fails
        // The introduction is still stored and can be seen when the target user next interacts
      }

      // Record the proposal in quota system
      try {
        await quotaService.recordProposal(message.entityId, userStatus);
        logger.info(
          `[discover-connection] Recorded proposal for ${userStatus} ${message.entityId}`
        );
      } catch (quotaError) {
        logger.error(`[discover-connection] Error recording proposal: ${quotaError}`);
        // Continue even if quota recording fails
      }

      // Get updated quota status for confirmation message
      const remainingQuotaMessage = await quotaService.getQuotaStatusMessage(
        message.entityId,
        userStatus
      );

      const confirmationText = `Perfect! I've sent an introduction proposal to your potential match. They'll be notified about the connection opportunity and can choose to accept or decline. I'll let you know as soon as I hear back from them!\n\n${remainingQuotaMessage}`;

      if (callback) {
        await callback({
          text: confirmationText,
          actions: ['REPLY'],
        });
      }

      return {
        text: confirmationText,
        success: true,
        values: {
          fromUserId: requestingUserId,
          toUserId: targetUserId,
          matchId: matchToProcess.id,
          introductionMessage,
          status: 'proposal_sent',
          userStatus: userStatus,
          remainingQuota: remainingQuotaMessage,
        },
      };
    } catch (error) {
      logger.error(`[discover-connection] Error in introduction proposal: ${error}`);

      const errorText =
        'I encountered an issue while sending the introduction proposal. Please try again in a moment.';

      if (callback) {
        await callback({
          text: errorText,
          actions: ['REPLY'],
        });
      }

      return {
        text: errorText,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};
