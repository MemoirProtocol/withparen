import {
  type Evaluator,
  type IAgentRuntime,
  type Memory,
  logger,
  ModelType,
  parseKeyValueXml,
} from '@elizaos/core';

import { circlesVerificationExtractionTemplate } from '../utils/promptTemplates.js';

/**
 * Circles Verification Evaluator for Discover-Connection
 * Extracts verification information from conversations and updates status when complete
 * Runs automatically when user has matches with 'circles_verification_needed' status
 */
export const circlesVerificationEvaluator: Evaluator = {
  name: 'CIRCLES_VERIFICATION_EVALUATOR',
  description: 'Extracts verification data from conversations and manages verification completion',
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
        `[circles-verification-evaluator] Processing verification data extraction for user ${message.entityId}`
      );

      // Get existing verification record
      const verificationRecords = await runtime.getMemories({
        tableName: 'circles_verification',
        entityId: message.entityId,
        count: 1,
      });

      let existingVerificationData: any = {
        metriAccount: '',
        socialLinks: [],
        hasMinimumInfo: false,
      };

      if (verificationRecords.length > 0) {
        existingVerificationData = verificationRecords[0].content as any;
      }

      // Get recent message history for context
      const recentMessages = await runtime.getMemories({
        roomId: message.roomId,
        tableName: 'messages',
        count: 10,
      });

      const messageHistory = recentMessages
        .reverse()
        .map((m) => {
          const sender = m.entityId === runtime.agentId ? 'Discover-Connection' : 'User';
          return `${sender}: ${m.content.text}`;
        })
        .join('\n');

      // Format existing data for context
      const existingDataFormatted = `
Metri Account: ${existingVerificationData.metriAccount || 'Not provided'}
Social Links: ${existingVerificationData.socialLinks?.join(', ') || 'None provided'}
Has Minimum Info: ${existingVerificationData.hasMinimumInfo || false}
      `.trim();

      // Use extraction template to analyze conversation
      const extractionPrompt = circlesVerificationExtractionTemplate
        .replace('{{recentMessages}}', messageHistory)
        .replace('{{existingVerificationData}}', existingDataFormatted);

      const extractionResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt: extractionPrompt,
      });

      const extractionParsed = parseKeyValueXml(extractionResponse);

      if (!extractionParsed) {
        logger.error('[circles-verification-evaluator] Failed to parse extraction response');
        return;
      }

      logger.debug(`[circles-verification-evaluator] Extraction result: ${JSON.stringify(extractionParsed)}`);

      // Update verification data with extracted information
      const newMetriAccount = extractionParsed.metriAccount?.trim() || existingVerificationData.metriAccount;
      
      // Merge social links, avoiding duplicates
      const existingSocialLinks = existingVerificationData.socialLinks || [];
      const newSocialLinks = extractionParsed.socialLinks ? 
        extractionParsed.socialLinks.split(',').map((link: string) => link.trim()).filter((link: string) => link) : 
        [];
      
      const allSocialLinks = [...new Set([...existingSocialLinks, ...newSocialLinks])];
      
      // Check if we have minimum info
      const hasAccount = !!newMetriAccount;
      const hasSocialLinks = allSocialLinks.length > 0;
      const hasMinimumInfo = hasAccount && hasSocialLinks;

      const updatedVerificationData = {
        metriAccount: newMetriAccount,
        socialLinks: allSocialLinks,
        hasMinimumInfo: hasMinimumInfo,
        lastUpdated: Date.now(),
        extractionReason: extractionParsed.extractionReason || 'Data extraction completed',
      };

      // Update or create verification record
      if (verificationRecords.length > 0 && verificationRecords[0].id) {
        // Update existing record
        await runtime.updateMemory({
          id: verificationRecords[0].id,
          content: {
            ...updatedVerificationData,
            type: 'circles_verification',
            text: `Verification data: ${hasMinimumInfo ? 'Complete' : 'In progress'}`,
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
            text: `Verification data: ${hasMinimumInfo ? 'Complete' : 'In progress'}`,
          },
          createdAt: Date.now(),
        };

        await runtime.createMemory(verificationRecord, 'circles_verification');
      }

      logger.info(
        `[circles-verification-evaluator] Updated verification data - Account: ${!!newMetriAccount}, Social Links: ${allSocialLinks.length}, Complete: ${hasMinimumInfo}`
      );

      // If verification has minimum info, update match status to complete
      if (hasMinimumInfo && !existingVerificationData.hasMinimumInfo) {
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
        `[circles-verification-evaluator] Completed verification processing for user ${message.entityId}`
      );
    } catch (error) {
      logger.error(`[circles-verification-evaluator] Error processing verification: ${error}`);
    }
  },
};