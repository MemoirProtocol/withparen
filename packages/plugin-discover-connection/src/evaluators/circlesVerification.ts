import {
  type Evaluator,
  type IAgentRuntime,
  type Memory,
  logger,
  ModelType,
  parseKeyValueXml,
} from '@elizaos/core';

import { circlesVerificationTemplate } from '../utils/promptTemplates.js';

/**
 * Circles Verification Evaluator for Discover-Connection
 * Evaluates user responses during the Circles network verification process
 * Runs automatically when user has matches with 'circles_verification_needed' status
 */
export const circlesVerificationEvaluator: Evaluator = {
  name: 'CIRCLES_VERIFICATION_EVALUATOR',
  description: 'Evaluates and processes user responses during Circles network verification',
  examples: [],

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    try {
      // Check if user has any matches with 'circles_verification_needed' status
      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 50,
      });

      const verificationMatches = matches.filter((match) => {
        const matchData = match.content as any;
        return (
          (matchData.user1Id === message.entityId || matchData.user2Id === message.entityId) &&
          matchData.status === 'circles_verification_needed'
        );
      });

      // Only evaluate if user is in verification process and sent a message
      return verificationMatches.length > 0 && message.entityId !== runtime.agentId;
    } catch (error) {
      logger.error(`[circles-verification-evaluator] Error validating: ${error}`);
      return false;
    }
  },

  handler: async (runtime: IAgentRuntime, message: Memory): Promise<void> => {
    try {
      logger.info(
        `[circles-verification-evaluator] Processing verification for user ${message.entityId}`
      );

      // Get existing verification record
      const verificationRecords = await runtime.getMemories({
        tableName: 'circles_verification',
        entityId: message.entityId,
        count: 1,
      });

      let currentStage = 'metri_account';
      let verificationData: any = {
        stage: 'metri_account',
        needsHelp: true,
      };

      if (verificationRecords.length > 0) {
        verificationData = verificationRecords[0].content as any;
        currentStage = verificationData.stage || 'metri_account';
      }

      // Get message history for context
      const recentMessages = await runtime.getMemories({
        roomId: message.roomId,
        tableName: 'messages',
        count: 10,
      });

      const messageHistory = recentMessages
        .map(
          (m) =>
            `${m.entityId === runtime.agentId ? 'Discover-Connection' : 'User'}: ${m.content.text}`
        )
        .join('\n');

      // Use verification template with message history
      const verificationPrompt = circlesVerificationTemplate
        .replace('{{userContext}}', messageHistory)
        .replace('{{userResponse}}', message.content.text || '')
        .replace('{{verificationStage}}', currentStage);

      const verificationResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt: verificationPrompt,
      });

      const verificationParsed = parseKeyValueXml(verificationResponse);

      if (!verificationParsed) {
        logger.error('[circles-verification-evaluator] Failed to parse verification response');
        return;
      }

      const nextStage = verificationParsed.nextStage || currentStage;

      // Extract verification info based on current stage and user response
      const messageText = message.content.text || '';

      // Update verification data based on what was provided
      if (currentStage === 'metri_account') {
        // Check if user mentioned Metri account
        if (
          messageText.toLowerCase().includes('metri') ||
          messageText.toLowerCase().includes('account')
        ) {
          const accountMatch =
            messageText.match(/metri[:\s]*(\S+)/i) || messageText.match(/account[:\s]*(\S+)/i);

          if (accountMatch) {
            verificationData.metriAccount = accountMatch[1];
          }
        }
      } else if (currentStage === 'social_links') {
        // Extract social links from message
        const links: string[] = [];
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const matches = messageText.match(urlRegex);

        if (matches) {
          links.push(...matches);
        }

        // Also look for platform mentions
        const platformRegex = /@(\w+)|github\.com\/(\w+)|twitter\.com\/(\w+)|x\.com\/(\w+)/g;
        const platformMatches = messageText.match(platformRegex);

        if (platformMatches) {
          links.push(...platformMatches);
        }

        if (links.length > 0) {
          verificationData.socialLinks = [...(verificationData.socialLinks || []), ...links];
        }
      }

      // Update verification record
      const updatedVerificationData = {
        ...verificationData,
        stage: nextStage,
        lastUpdated: Date.now(),
      };

      if (verificationRecords.length > 0 && verificationRecords[0].id) {
        // Update existing record
        await runtime.updateMemory({
          id: verificationRecords[0].id,
          content: {
            ...updatedVerificationData,
            type: 'circles_verification',
            text: `Verification stage: ${nextStage}`,
          },
        });
      } else {
        // Create new verification record
        const verificationRecord = {
          entityId: message.entityId,
          agentId: runtime.agentId,
          roomId: message.roomId,
          content: {
            ...updatedVerificationData,
            type: 'circles_verification',
            text: `Verification stage: ${nextStage}`,
          },
          createdAt: Date.now(),
        };

        await runtime.createMemory(verificationRecord, 'circles_verification');
      }

      // If verification is complete, update match status
      if (nextStage === 'complete') {
        const matches = await runtime.getMemories({
          tableName: 'matches',
          count: 50,
        });

        const matchToUpdate = matches.find((match) => {
          const matchData = match.content as any;
          return (
            (matchData.user1Id === message.entityId || matchData.user2Id === message.entityId) &&
            matchData.status === 'circles_verification_needed'
          );
        });

        if (matchToUpdate?.id) {
          const matchData = matchToUpdate.content as any;
          const updatedMatchContent = {
            ...matchData,
            status: 'circles_verification_filled',
            verificationCompleted: true,
            verificationCompletedAt: Date.now(),
          };

          await runtime.updateMemory({
            id: matchToUpdate.id,
            content: updatedMatchContent,
          });

          logger.info(
            `[circles-verification-evaluator] Updated match status to circles_verification_filled for user ${message.entityId}`
          );
        }
      }

      logger.info(
        `[circles-verification-evaluator] Processed verification for user ${message.entityId}, stage: ${nextStage}`
      );
    } catch (error) {
      logger.error(`[circles-verification-evaluator] Error processing verification: ${error}`);
    }
  },
};
