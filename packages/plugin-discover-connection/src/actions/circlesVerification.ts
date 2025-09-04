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

/**
 * Circles Verification Action for Discover-Connection
 * Handles when users explicitly request Circles network verification
 * Transitions from group_onboarding to circles_verification_needed status
 */
export const circlesVerificationAction: Action = {
  name: 'CIRCLES_VERIFICATION',
  description:
    'Handles user requests for Circles network verification by transitioning match status and starting the verification info collection process',
  similes: [
    'START_VERIFICATION',
    'REQUEST_VERIFICATION',
    'NEED_VERIFICATION',
    'HELP_WITH_VERIFICATION',
  ],
  examples: [] as ActionExample[][],

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    try {
      logger.info(
        `[discover-connection] DEBUG - CIRCLES_VERIFICATION validation for user ${message.entityId}`
      );

      // Check for matches with "group_onboarding" status for this user
      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 50,
      });

      const groupOnboardingMatches = matches.filter((match) => {
        const matchData = match.content as any;
        return (
          (matchData.user1Id === message.entityId || matchData.user2Id === message.entityId) &&
          matchData.status === 'group_onboarding'
        );
      });

      const isValid = groupOnboardingMatches.length > 0;
      logger.info(
        `[discover-connection] DEBUG - CIRCLES_VERIFICATION validation result: ${isValid ? 'PASSED' : 'FAILED'} (${groupOnboardingMatches.length} group_onboarding matches)`
      );

      return isValid;
    } catch (error) {
      logger.error(`[discover-connection] Error validating circles verification action: ${error}`);
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
        `[discover-connection] Processing Circles verification request for user ${message.entityId}`
      );

      // Get matches with "group_onboarding" status for this user
      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 50,
      });

      const matchesToUpdate = matches.filter((match) => {
        const matchData = match.content as any;
        return (
          (matchData.user1Id === message.entityId || matchData.user2Id === message.entityId) &&
          matchData.status === 'group_onboarding'
        );
      });

      if (matchesToUpdate.length === 0) {
        const noMatchText =
          "I don't see any pending group onboarding requests. Please let me search for connections first.";

        if (callback) {
          await callback({
            text: noMatchText,
            actions: ['REPLY'],
          });
        }

        return {
          text: noMatchText,
          success: false,
          error: new Error('No group onboarding matches found'),
        };
      }

      // Update all group_onboarding matches to circles_verification_needed
      for (const match of matchesToUpdate) {
        if (match.id) {
          const matchData = match.content as any;
          const updatedMatchContent = {
            ...matchData,
            status: 'circles_verification_needed',
            verificationRequestedAt: Date.now(),
          };

          await runtime.updateMemory({
            id: match.id,
            content: updatedMatchContent,
          });

          logger.info(
            `[discover-connection] Updated match status from group_onboarding to circles_verification_needed for user ${message.entityId}`
          );
        }
      }

      const verificationText = `Perfect! I'll help you get verified in the Circles network so you can access your introduction.

To get started, have you already created a Metri account at https://metri.xyz/?

If yes, please share your Metri account address (it should start with 'metri:' or be a wallet address).

If no, you'll need to create one first - it's quick and helps establish your identity in the Circles network.`;

      if (callback) {
        await callback({
          text: verificationText,
          actions: ['REPLY'],
        });
      }

      return {
        text: verificationText,
        success: true,
        values: {
          updatedMatches: matchesToUpdate.length,
          newStatus: 'circles_verification_needed',
        },
        data: {
          actionName: 'CIRCLES_VERIFICATION',
          updatedMatchCount: matchesToUpdate.length,
        },
      };
    } catch (error) {
      logger.error(`[discover-connection] Error in circles verification action: ${error}`);

      const errorText =
        'I encountered an issue while starting your Circles verification process. Please try again.';

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