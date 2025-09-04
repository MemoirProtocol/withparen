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

import { MatchStatus } from '../services/userStatusService.js';
import { getUserInfo } from '../utils/userUtils.js';

/**
 * Introduction Accept/Decline Action for Discover-Connection
 * Handles responses to introduction proposals
 */
export const introAcceptAction: Action = {
  name: 'INTRO_ACCEPT',
  description: 'Handles acceptance or decline of introduction proposals from potential matches',
  similes: [
    'ACCEPT_INTRODUCTION',
    'DECLINE_INTRODUCTION',
    'RESPOND_INTRODUCTION',
    'INTRODUCTION_RESPONSE',
    'INTRO_RESPONSE',
  ],
  examples: [] as ActionExample[][],

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    try {
      // Check if user has matches with PROPOSAL_PENDING status where they are NOT the initiator
      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 50,
      });

      const pendingProposals = matches.filter((match) => {
        const matchData = match.content as any;
        return (
          (matchData.user1Id === message.entityId || matchData.user2Id === message.entityId) &&
          matchData.status === MatchStatus.PROPOSAL_PENDING &&
          matchData.proposalInitiator !== message.entityId // User is NOT the one who initiated
        );
      });

      if (pendingProposals.length === 0) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`[discover-connection] Error validating intro accept action: ${error}`);
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
        `[discover-connection] Processing introduction response from user ${message.entityId}`
      );

      // Get matches with PROPOSAL_PENDING status where this user is NOT the initiator
      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 50,
      });

      const pendingProposals = matches.filter((match) => {
        const matchData = match.content as any;
        return (
          (matchData.user1Id === message.entityId || matchData.user2Id === message.entityId) &&
          matchData.status === MatchStatus.PROPOSAL_PENDING &&
          matchData.proposalInitiator !== message.entityId // User is NOT the initiator
        );
      });

      if (pendingProposals.length === 0) {
        const noIntroText =
          "I don't see any pending introduction requests for you right now. Would you like me to search for new connections?";

        if (callback) {
          await callback({
            text: noIntroText,
            actions: ['REPLY'],
          });
        }

        return {
          text: noIntroText,
          success: false,
          error: new Error('No pending introductions found'),
        };
      }

      // Process the most recent proposal
      const introToProcess = pendingProposals[0];
      const introData = introToProcess.content as any;

      // Determine the other user in this match
      const isUser1 = introData.user1Id === message.entityId;
      const otherUserId = isUser1 ? introData.user2Id : introData.user1Id;
      const respondingUserId = message.entityId;

      // Analyze the user's response to determine acceptance or decline
      const messageText = message.content.text?.toLowerCase() || '';
      const acceptKeywords = [
        'yes',
        'accept',
        'sure',
        'sounds good',
        'i would like',
        'connect',
        'interested',
      ];
      const declineKeywords = ['no', 'decline', 'not interested', 'pass', 'not right now'];

      const isAccepting = acceptKeywords.some((keyword) => messageText.includes(keyword));
      const isDeclining = declineKeywords.some((keyword) => messageText.includes(keyword));

      if (!isAccepting && !isDeclining) {
        // Ambiguous response, ask for clarification
        const clarificationText =
          "I want to make sure I understand correctly - would you like me to connect you with this person? Please let me know 'yes' if you'd like the introduction or 'no' if you'd prefer to pass on this connection.";

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

      let responseText: string;
      let newStatus: string;

      if (isAccepting) {
        // Both users accepted - make the connection!

        // Get other user's information for the connection message
        const otherUserInfo = await getUserInfo(runtime, otherUserId);
        const otherUserDisplayName = otherUserInfo.displayName;
        const otherUserUsername = otherUserInfo.username;

        // Update status to accepted, then connected
        newStatus = MatchStatus.ACCEPTED;

        // Construct response with proper name and @username format
        if (otherUserUsername) {
          responseText = `Wonderful! I'm excited to connect you two. You can now reach out to ${otherUserDisplayName} directly using @${otherUserUsername}. They're also looking forward to connecting with you! Here's a great way to start: mention what drew you to connect and share what you're working on. Good luck with your new connection!`;
        } else {
          // Fallback if no username is available
          responseText = `Wonderful! I'm excited to connect you two. ${otherUserDisplayName} hasn't set a username on Telegram yet, so I couldn't share it with you. But don't worry - they have your username and should reach out any minute! In the meantime, if you'd like to send them a message, just let me know and I'll pass it along.`;
        }

        // Send success message to the original requesting user
        try {
          // Get the accepting user's info for the message
          const acceptingUserInfo = await getUserInfo(runtime, respondingUserId);
          const acceptingUserDisplayName = acceptingUserInfo.displayName;
          const acceptingUserUsername = acceptingUserInfo.username;

          // Find the original user's room to send them the good news
          const originalUserRooms = await runtime.getMemories({
            tableName: 'rooms',
            count: 10,
          });

          let originalUserRoom: Memory | undefined = undefined;
          for (const room of originalUserRooms) {
            const roomData = room.content as any;
            if (room.entityId === otherUserId || roomData?.participants?.includes(otherUserId)) {
              originalUserRoom = room;
              break;
            }
          }

          // Construct success message with proper name and @username format
          let successMessage: string;
          if (acceptingUserUsername) {
            successMessage = `Great news! ${acceptingUserDisplayName} accepted your introduction and is excited to connect with you. You can now reach out to them directly using @${acceptingUserUsername}. Here's a great way to start: mention what drew you to connect and share what you're working on. Good luck with your new connection!`;
          } else {
            // Fallback if no username is available
            successMessage = `Great news! ${acceptingUserDisplayName} accepted your introduction and is excited to connect with you! They haven't set a username on Telegram yet, so I couldn't share it with you. But they have your username and should reach out any minute! If you'd like to send them a message in the meantime, just let me know and I'll pass it along.`;
          }

          if (originalUserRoom) {
            const roomContent = originalUserRoom.content as any;
            const targetInfo = {
              source: roomContent.source || 'telegram',
              roomId: otherUserId, // For DMs, roomId equals the target user's entityId
              entityId: otherUserId,
            };

            await runtime.sendMessageToTarget(targetInfo, {
              text: successMessage,
              source: 'agent_introduction',
              type: 'connection_success',
            });

            logger.info(
              `[discover-connection] Successfully notified original user ${otherUserId} about accepted introduction`
            );

            // Log message content sent to original user
            logger.info(
              `[discover-connection] MESSAGE_SENT_TO_USER: User ${otherUserId} received connection success message: "${successMessage.substring(0, 100)}${successMessage.length > 100 ? '...' : ''}"`
            );
          } else {
            // Fallback method - For DMs, roomId equals the target user's entityId
            const fallbackTargetInfo = {
              source: 'telegram',
              roomId: otherUserId, // For DMs, roomId equals the target user's entityId
              entityId: otherUserId,
            };

            await runtime.sendMessageToTarget(fallbackTargetInfo, {
              text: successMessage,
              source: 'agent_introduction',
              type: 'connection_success',
            });

            logger.info(
              `[discover-connection] Sent success notification using fallback method to user ${otherUserId}`
            );

            // Log message content sent to original user (fallback)
            logger.info(
              `[discover-connection] MESSAGE_SENT_TO_USER: User ${otherUserId} received connection success message (fallback): "${successMessage.substring(0, 100)}${successMessage.length > 100 ? '...' : ''}"`
            );
          }
        } catch (messageError) {
          logger.error(
            `[discover-connection] Failed to send success message to original user ${otherUserId}: ${messageError}`
          );
          // Continue with the workflow even if message delivery fails
        }

        // Find and update ALL match records for this connection to ACCEPTED -> CONNECTED
        const allMatches = await runtime.getMemories({
          tableName: 'matches',
          count: 100,
        });

        const relatedMatches = allMatches.filter((match) => {
          const matchData = match.content as any;
          return (
            ((matchData.user1Id === otherUserId && matchData.user2Id === respondingUserId) ||
              (matchData.user1Id === respondingUserId && matchData.user2Id === otherUserId)) &&
            matchData.status === MatchStatus.PROPOSAL_PENDING
          );
        });

        // Update all related match records to CONNECTED
        for (const match of relatedMatches) {
          if (match.id) {
            const updatedMatchContent = {
              ...match.content,
              status: MatchStatus.CONNECTED,
              connectedAt: Date.now(),
            };

            await runtime.updateMemory({
              id: match.id,
              content: updatedMatchContent,
            });

            logger.info(`[discover-connection] Updated match ${match.id} status to CONNECTED`);
          }
        }
      } else {
        // User declined the introduction
        newStatus = MatchStatus.DECLINED;
        responseText =
          "No problem at all! Not every connection is the right fit, and that's perfectly okay. I'll keep looking for other potential matches that might be more aligned with what you're seeking. Thanks for letting me know!";
      }

      // Update the match status for the responding user's record
      if (introToProcess.id) {
        const updatedIntroContent = {
          ...introData,
          status: newStatus,
          responseTimestamp: Date.now(),
        };

        await runtime.updateMemory({
          id: introToProcess.id,
          content: updatedIntroContent,
        });
      }

      // Update introduction record in introductions table
      const introductions = await runtime.getMemories({
        tableName: 'introductions',
        count: 50,
      });

      const matchingIntroduction = introductions.find((intro) => {
        const introContent = intro.content as any;
        return (
          introContent.toUserId === respondingUserId &&
          introContent.fromUserId === otherUserId &&
          introContent.status === 'proposal_sent'
        );
      });

      if (matchingIntroduction && matchingIntroduction.id) {
        const updatedIntroductionContent = {
          ...matchingIntroduction.content,
          status: isAccepting ? 'accepted' : 'declined',
          responseTimestamp: Date.now(),
        };

        await runtime.updateMemory({
          id: matchingIntroduction.id,
          content: updatedIntroductionContent,
        });

        logger.info(
          `[discover-connection] Updated introduction record status to ${updatedIntroductionContent.status}`
        );
      }

      if (callback) {
        await callback({
          text: responseText,
          actions: ['REPLY'],
        });

        // Log message content sent to accepting user
        logger.info(
          `[discover-connection] MESSAGE_SENT_TO_USER: User ${respondingUserId} received response: "${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}"`
        );
      }

      return {
        text: responseText,
        success: true,
        values: {
          respondingUserId,
          otherUserId,
          status: newStatus,
          accepted: isAccepting,
        },
      };
    } catch (error) {
      logger.error(`[discover-connection] Error in introduction response: ${error}`);

      const errorText =
        'I encountered an issue while processing your response. Please try again in a moment.';

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
