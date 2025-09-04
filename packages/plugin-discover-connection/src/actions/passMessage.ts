import {
  type IAgentRuntime,
  type Memory,
  type Action,
  type State,
  type ActionExample,
  type HandlerCallback,
  type ActionResult,
  logger,
} from '@elizaos/core';

import { getUserInfo } from '../utils/userUtils.js';
import { MatchStatus } from '../services/userStatusService.js';

/**
 * Pass Message Action for Discover-Connection
 * Allows users to pass messages to their recently connected matches
 */
export const passMessageAction: Action = {
  name: 'PASS_MESSAGE',
  description:
    'Passes a message from one user to their recently connected match when direct communication is not yet established',
  similes: [
    'SEND_MESSAGE',
    'RELAY_MESSAGE',
    'PASS_ALONG',
    'TELL_THEM',
    'LET_THEM_KNOW',
    'SHARE_MESSAGE',
  ],
  examples: [] as ActionExample[][],

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    try {
      // Check if the user has any connected matches
      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 50,
      });

      // Find the most recent match with "connected" or "accepted" status for this user
      const connectedMatches = matches
        .filter((match) => {
          const matchData = match.content as any;
          return (
            (matchData.user1Id === message.entityId || matchData.user2Id === message.entityId) &&
            (matchData.status === MatchStatus.CONNECTED ||
              matchData.status === MatchStatus.ACCEPTED)
          );
        })
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      if (connectedMatches.length === 0) {
        return false;
      }

      // Check if user is trying to pass a message in their text
      const messageText = message.content.text?.toLowerCase() || '';
      const messageKeywords = [
        'tell them',
        'let them know',
        'pass',
        'oass', // Common typo for 'pass'
        'say',
        'message',
        'please tell',
        'can you tell',
        'relay',
        'share with them',
      ];

      const hasMessageRequest = messageKeywords.some((keyword) => messageText.includes(keyword));

      // Only validate if they have a connected match and are asking to pass a message
      return connectedMatches.length > 0 && hasMessageRequest;
    } catch (error) {
      logger.error(`[discover-connection] Error validating pass message action: ${error}`);
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
        `[discover-connection] Processing message pass request from user ${message.entityId}`
      );

      // Get the most recent connected match
      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 50,
      });

      const connectedMatches = matches
        .filter((match) => {
          const matchData = match.content as any;
          return (
            (matchData.user1Id === message.entityId || matchData.user2Id === message.entityId) &&
            (matchData.status === MatchStatus.CONNECTED ||
              matchData.status === MatchStatus.ACCEPTED)
          );
        })
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      if (connectedMatches.length === 0) {
        const noMatchText =
          "You don't have any connected matches to pass messages to. Would you like me to search for new connections?";

        if (callback) {
          await callback({
            text: noMatchText,
            actions: ['REPLY'],
          });
        }

        return {
          text: noMatchText,
          success: false,
          error: new Error('No connected matches found'),
        };
      }

      // Get the most recent connected match
      const latestMatch = connectedMatches[0];
      const matchData = latestMatch.content as any;

      // Determine the recipient
      const isUser1 = matchData.user1Id === message.entityId;
      const recipientUserId = isUser1 ? matchData.user2Id : matchData.user1Id;
      const senderUserId = message.entityId;

      // Extract the message to pass from the user's input
      const userMessage = message.content.text || '';

      // Remove common prefixes to get the actual message
      const prefixPatterns = [
        /^(please\s+)?tell\s+them\s+(that\s+)?/i,
        /^(please\s+)?let\s+them\s+know\s+(that\s+)?/i,
        /^(please\s+)?pass\s+(this\s+)?message:?\s*/i,
        /^(please\s+)?say\s+(that\s+)?/i,
        /^(can\s+you\s+)?tell\s+them\s+(that\s+)?/i,
        /^message:?\s*/i,
        /^relay:?\s*/i,
        /^share\s+with\s+them:?\s*/i,
      ];

      let messageToPass = userMessage;
      for (const pattern of prefixPatterns) {
        messageToPass = messageToPass.replace(pattern, '');
      }

      messageToPass = messageToPass.trim();

      if (!messageToPass || messageToPass.length < 3) {
        const clarificationText =
          "What message would you like me to pass to your connection? Just tell me what you'd like them to know.";

        if (callback) {
          await callback({
            text: clarificationText,
            actions: ['REPLY'],
          });
        }

        return {
          text: clarificationText,
          success: true,
          values: { needsClarification: true },
        };
      }

      // Get sender's information for the message
      const senderInfo = await getUserInfo(runtime, senderUserId);
      const senderDisplayName = senderInfo.displayName;

      // Get recipient's information
      const recipientInfo = await getUserInfo(runtime, recipientUserId);
      const recipientDisplayName = recipientInfo.displayName;

      // Format the message to send to the recipient
      const formattedMessage = `📬 Message from ${senderDisplayName}: "${messageToPass}"`;

      // Send the message to the recipient
      try {
        const targetInfo = {
          source: 'telegram', // Default to telegram
          roomId: recipientUserId, // For DMs, roomId equals the user's entityId
          entityId: recipientUserId,
        };

        await runtime.sendMessageToTarget(targetInfo, {
          text: formattedMessage,
          source: 'agent_message_relay',
          type: 'passed_message',
        });

        logger.info(
          `[discover-connection] Successfully passed message from ${senderUserId} to ${recipientUserId}`
        );

        // Log message content sent to recipient
        logger.info(
          `[discover-connection] MESSAGE_SENT_TO_USER: User ${recipientUserId} received passed message from ${senderDisplayName}: "${formattedMessage.substring(0, 150)}${formattedMessage.length > 150 ? '...' : ''}"`
        );

        const confirmationText = `✅ I've passed your message to ${recipientDisplayName}. They should receive it shortly!`;

        if (callback) {
          await callback({
            text: confirmationText,
            actions: ['REPLY'],
          });

          // Log confirmation message sent to sender
          logger.info(
            `[discover-connection] MESSAGE_SENT_TO_USER: User ${senderUserId} received confirmation: "${confirmationText}"`
          );
        }

        return {
          text: confirmationText,
          success: true,
          values: {
            senderUserId,
            recipientUserId,
            message: messageToPass,
            matchId: latestMatch.id,
          },
        };
      } catch (messageError) {
        logger.error(
          `[discover-connection] Failed to pass message to ${recipientUserId}: ${messageError}`
        );

        const errorText = `I couldn't deliver your message right now. ${recipientDisplayName} might be offline. They'll see it when they come back online, or you can try again later.`;

        if (callback) {
          await callback({
            text: errorText,
            actions: ['REPLY'],
          });
        }

        return {
          text: errorText,
          success: false,
          error: messageError instanceof Error ? messageError : new Error(String(messageError)),
        };
      }
    } catch (error) {
      logger.error(`[discover-connection] Error in pass message action: ${error}`);

      const errorText =
        'I encountered an issue while trying to pass your message. Please try again in a moment.';

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
