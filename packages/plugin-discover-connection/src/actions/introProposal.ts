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

import { introductionProposalTemplate } from '../utils/promptTemplates.js';

/**
 * Introduction Proposal Action for Discover-Connection
 * Handles sending introduction proposals to potential matches
 */
export const introProposalAction: Action = {
  name: 'INTRO_PROPOSAL',
  description:
    'Sends an introduction proposal to a potential match after the user expresses interest',
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
      // Check if there are any matches with "match_found" status for this user
      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 50,
      });

      // Find matches where this user is involved and status is "match_found"
      const pendingMatches = matches.filter((match) => {
        const matchData = match.content as any;
        return (
          (matchData.user1Id === message.entityId || matchData.user2Id === message.entityId) &&
          matchData.status === 'match_found'
        );
      });

      // Also check if user is explicitly asking for an introduction in their message
      const messageText = message.content.text?.toLowerCase() || '';
      const introductonKeywords = [
        'introduction',
        'introduce',
        'connect',
        'yes',
        'i would like',
        'sounds good',
      ];
      const hasIntroductionRequest = introductonKeywords.some((keyword) =>
        messageText.includes(keyword)
      );

      return pendingMatches.length > 0 && hasIntroductionRequest;
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
      logger.info(`[discover-connection] Processing introduction proposal for user ${message.entityId}`);

      // Get matches with "match_found" status for this user
      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 50,
      });

      const pendingMatches = matches.filter((match) => {
        const matchData = match.content as any;
        return (
          (matchData.user1Id === message.entityId || matchData.user2Id === message.entityId) &&
          matchData.status === 'match_found'
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

      logger.info(`[discover-connection] Processing introduction: ${requestingUserId} -> ${targetUserId}`);

      // Get the target user's connection context to personalize the message
      const targetConnectionContexts = await runtime.getMemories({
        entityId: targetUserId,
        tableName: 'connection_contexts',
        count: 1,
      });

      const targetConnectionContext =
        targetConnectionContexts.length > 0
          ? targetConnectionContexts[0].content.text
          : 'Not specified';

      // Get requesting user's persona context
      const requestingPersonaContexts = await runtime.getMemories({
        entityId: requestingUserId,
        tableName: 'persona_contexts',
        count: 1,
      });

      const requestingPersonaContext =
        requestingPersonaContexts.length > 0
          ? requestingPersonaContexts[0].content.text
          : 'Not available';

      // Generate personalized introduction message
      const prompt = introductionProposalTemplate
        .replace('{{requestingUserPersona}}', requestingPersonaContext || 'Not available')
        .replace('{{targetUserDesiredConnection}}', targetConnectionContext || 'Not specified')
        .replace('{{compatibilityScore}}', (matchData.compatibilityScore || 0).toString())
        .replace(
          '{{compatibilityReasoning}}',
          matchData.reasoning || 'Good compatibility detected'
        );

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
        },
        createdAt: Date.now(),
      };

      await runtime.createMemory(introductionRecord, 'introductions');

      // Update match status to "introduction_outgoing" for the requesting user
      if (matchToProcess.id) {
        const updatedMatchContent = {
          ...matchData,
          status: 'introduction_outgoing',
        };

        await runtime.updateMemory({
          id: matchToProcess.id,
          content: updatedMatchContent,
        });
      }

      // Create a match record for the target user to prevent them from getting the same match
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
          status: 'introduction_incoming', // Target user has incoming introduction
          personaContext: matchData.connectionContext, // Swap contexts for target user
          connectionContext: matchData.personaContext,
        },
        createdAt: Date.now(),
      };

      await runtime.createMemory(targetMatchRecord, 'matches');

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

      const confirmationText = `Perfect! I've sent an introduction proposal to your potential match. They'll be notified about the connection opportunity and can choose to accept or decline. I'll let you know as soon as I hear back from them!`;

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
