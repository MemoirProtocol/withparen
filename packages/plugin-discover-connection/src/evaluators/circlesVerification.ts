import {
  type Evaluator,
  type IAgentRuntime,
  type Memory,
  logger,
  ModelType,
  parseKeyValueXml,
} from '@elizaos/core';

import { circlesVerificationExtractionTemplate } from '../utils/promptTemplates.js';
import { UserStatusService, UserStatus } from '../services/userStatusService.js';
import { AutoProposalService } from '../services/autoProposal.js';

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
      // Only evaluate messages from users (not the agent)
      if (message.entityId === runtime.agentId) {
        return false;
      }

      // Check if user has UNVERIFIED_MEMBER status (needs to provide verification info)
      const userStatusService = new UserStatusService(runtime);
      const userStatus = await userStatusService.getUserStatus(message.entityId);

      // Only evaluate if user is in UNVERIFIED_MEMBER status (verification needed)
      const shouldEvaluate = userStatus === UserStatus.UNVERIFIED_MEMBER;

      logger.debug(
        `[circles-verification-evaluator] Validation for user ${message.entityId}: status=${userStatus}, should evaluate=${shouldEvaluate}`
      );

      return shouldEvaluate;
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
Metri Account: ${existingVerificationData.metriAccount || ''}
Social Links: ${existingVerificationData.socialLinks?.join(', ') || ''}
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

      logger.debug(
        `[circles-verification-evaluator] Extraction result: ${JSON.stringify(extractionParsed)}`
      );

      // Update verification data with extracted information
      // Only use extracted data if it's not empty and not placeholder text
      const extractedMetriAccount = extractionParsed.metriAccount?.trim();
      const isValidMetriAccount =
        extractedMetriAccount &&
        extractedMetriAccount !== 'Not provided' &&
        extractedMetriAccount !== 'None provided' &&
        extractedMetriAccount !== '';

      const newMetriAccount = isValidMetriAccount
        ? extractedMetriAccount
        : existingVerificationData.metriAccount;

      // Merge social links, avoiding duplicates and placeholder text
      const existingSocialLinks = existingVerificationData.socialLinks || [];
      const extractedSocialLinks = extractionParsed.socialLinks
        ? extractionParsed.socialLinks
            .split(',')
            .map((link: string) => link.trim())
            .filter(
              (link: string) =>
                link && link !== 'None provided' && link !== 'Not provided' && link !== ''
            )
        : [];

      const allSocialLinks = [...new Set([...existingSocialLinks, ...extractedSocialLinks])];

      // Check if we have minimum info - use AI's assessment with safety validation
      const aiSaysMinimumInfo =
        extractionParsed.hasMinimumInfo === 'true' || extractionParsed.hasMinimumInfo === true;
      const hasAccount = !!newMetriAccount;
      const hasSocialLinks = allSocialLinks.length > 0;

      // AI must give green light AND we must have at least one account and one social link
      const hasMinimumInfo = aiSaysMinimumInfo && hasAccount && hasSocialLinks;

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
        `[circles-verification-evaluator] Updated verification data - Account: ${!!newMetriAccount}, Social Links: ${allSocialLinks.length}, AI Assessment: ${aiSaysMinimumInfo}, Complete: ${hasMinimumInfo}`
      );

      // If verification has minimum info, transition user to VERIFICATION_PENDING status
      logger.debug(
        `[circles-verification-evaluator] Transition check for user ${message.entityId}: AI says minimum=${aiSaysMinimumInfo}, has account=${hasAccount}, has social=${hasSocialLinks}, final decision=${hasMinimumInfo}, was previously complete=${existingVerificationData.hasMinimumInfo}`
      );

      if (hasMinimumInfo && !existingVerificationData.hasMinimumInfo) {
        const userStatusService = new UserStatusService(runtime);
        const transitionResult = await userStatusService.transitionUserStatus(
          message.entityId,
          UserStatus.VERIFICATION_PENDING
        );

        if (transitionResult) {
          logger.info(
            `[circles-verification-evaluator] Transitioned user ${message.entityId} to VERIFICATION_PENDING status`
          );

          // Trigger automatic proposals now that user is VERIFICATION_PENDING
          try {
            const autoProposalService = new AutoProposalService(runtime);
            await autoProposalService.triggerAutoProposalsForUser(
              message.entityId,
              UserStatus.VERIFICATION_PENDING
            );
            logger.info(
              `[circles-verification-evaluator] Triggered auto-proposals for new VERIFICATION_PENDING user ${message.entityId}`
            );
          } catch (autoProposalError) {
            logger.error(
              `[circles-verification-evaluator] Failed to trigger auto-proposals for ${message.entityId}: ${autoProposalError}`
            );
            // Continue anyway - don't break the evaluation flow
          }
        } else {
          logger.warn(
            `[circles-verification-evaluator] Failed to transition user ${message.entityId} to VERIFICATION_PENDING status`
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
