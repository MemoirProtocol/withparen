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
import { isAddress, type Address } from 'viem';
import { CirclesTrustService } from '../services/circlesTrust.js';
import { UserTrustStatusService } from '../services/userTrustStatus.js';

/**
 * Circles Trust Action for Discover-Connection
 * Handles user wallet address collection, executes trust transaction to add them to Paren's Circles group,
 * and triggers introduction proposal after successful trust
 */
export const circlesTrustAction: Action = {
  name: 'CIRCLES_TRUST',
  description:
    "Handles wallet address collection and trust transaction to add user to Paren's Circles group before introduction",
  similes: ['JOIN_GROUP', 'TRUST_WALLET', 'ADD_TO_GROUP'],
  examples: [] as ActionExample[][],

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    try {
      logger.info(
        `[discover-connection] DEBUG - CIRCLES_TRUST validation for user ${message.entityId}`
      );

      // Check if user is providing a wallet address first
      const messageText = message.content.text?.toLowerCase() || '';
      const hasWalletAddress = messageText.includes('0x') && messageText.length >= 40;

      logger.info(
        `[discover-connection] DEBUG - CIRCLES_TRUST wallet check: hasWalletAddress=${hasWalletAddress}, messageText="${messageText}"`
      );

      if (!hasWalletAddress) {
        logger.info(
          `[discover-connection] DEBUG - CIRCLES_TRUST validation FAILED: No wallet address found in message`
        );
        return false;
      }

      // Check for matches with "group_onboarding" status for this user
      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 50,
      });

      logger.info(
        `[discover-connection] DEBUG - CIRCLES_TRUST found ${matches.length} total matches in database`
      );

      const groupOnboardingMatches = matches.filter((match) => {
        const matchData = match.content as any;
        return (
          (matchData.user1Id === message.entityId || matchData.user2Id === message.entityId) &&
          matchData.status === 'group_onboarding'
        );
      });

      // Also check for invitation match records (stored as special matches with status 'invitation_pending')
      const invitationMatches = matches.filter((match) => {
        const matchData = match.content as any;
        return (
          matchData.user1Id === message.entityId &&
          matchData.status === 'invitation_pending' &&
          matchData.user2Id === runtime.agentId // Invitation matches use agent ID as placeholder
        );
      });

      logger.info(
        `[discover-connection] DEBUG - CIRCLES_TRUST match analysis: groupOnboardingMatches=${groupOnboardingMatches.length}, invitationMatches=${invitationMatches.length}`
      );

      // Log details of all matches for this user
      const userMatches = matches.filter((match) => {
        const matchData = match.content as any;
        return (
          matchData.user1Id === message.entityId ||
          matchData.user2Id === message.entityId ||
          (matchData.user1Id === message.entityId && matchData.user2Id === runtime.agentId)
        );
      });

      logger.info(
        `[discover-connection] DEBUG - CIRCLES_TRUST user matches details: ${userMatches
          .map((m) => {
            const data = m.content as any;
            return `[${data.status}] ${data.user1Id} <-> ${data.user2Id}`;
          })
          .join(', ')}`
      );

      const isValid = groupOnboardingMatches.length > 0 || invitationMatches.length > 0;
      logger.info(
        `[discover-connection] DEBUG - CIRCLES_TRUST validation result: ${isValid ? 'PASSED' : 'FAILED'}`
      );

      // Valid if has group_onboarding match OR has invitation match OR wallet address provided
      return isValid;
    } catch (error) {
      logger.error(`[discover-connection] Error validating circles trust action: ${error}`);
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
      logger.info(`[discover-connection] Processing Circles trust for user ${message.entityId}`);

      // Check if user is already trusted
      const userTrustService = new UserTrustStatusService(runtime);
      const isAlreadyTrusted = await userTrustService.isUserTrusted(message.entityId);

      if (isAlreadyTrusted) {
        logger.info(
          `[discover-connection] User ${message.entityId} is already trusted, skipping blockchain transaction`
        );

        // Get existing trust info
        const trustInfo = await userTrustService.getUserTrustInfo(message.entityId);

        // Ensure already-trusted users are properly recorded (in case they were trusted externally)
        if (trustInfo) {
          try {
            await userTrustService.setUserTrusted(
              message.entityId,
              trustInfo.walletAddress,
              trustInfo.trustTransactionHash,
              trustInfo.circlesGroupCA,
              message.roomId
            );
            logger.info(
              `[discover-connection] Ensured trust record exists for already-trusted user ${message.entityId}`
            );
          } catch (trustRecordError) {
            logger.error(
              `[discover-connection] Failed to ensure trust record for already-trusted user ${message.entityId}: ${trustRecordError}`
            );
            // Continue anyway - don't break the user flow
          }
        }

        // Handle both match-based and invitation-based flows for already trusted users
        const matches = await runtime.getMemories({
          tableName: 'matches',
          count: 50,
        });

        const matchToUpdate = matches.find((match) => {
          const matchData = match.content as any;
          return (
            (matchData.user1Id === message.entityId || matchData.user2Id === message.entityId) &&
            matchData.status === 'group_onboarding'
          );
        });

        const invitationToUpdate = matches.find((match) => {
          const matchData = match.content as any;
          return (
            matchData.user1Id === message.entityId &&
            matchData.status === 'invitation_pending' &&
            matchData.user2Id === runtime.agentId // Invitation matches use agent ID as placeholder
          );
        });

        if (matchToUpdate?.id) {
          // Update match status from "group_onboarding" to "ready_for_introduction"
          const matchData = matchToUpdate.content as any;
          const updatedMatchContent = {
            ...matchData,
            status: 'ready_for_introduction',
            skipReason: 'already_trusted',
            existingWallet: trustInfo?.walletAddress,
            existingTrustHash: trustInfo?.trustTransactionHash,
          };

          await runtime.updateMemory({
            id: matchToUpdate.id,
            content: updatedMatchContent,
          });

          logger.info(
            `[discover-connection] Updated match status to ready_for_introduction for already-trusted user ${message.entityId}`
          );
        } else if (invitationToUpdate?.id) {
          // Update invitation match status to completed for already trusted user
          const invitationData = invitationToUpdate.content as any;
          const updatedInvitationContent = {
            ...invitationData,
            status: 'invitation_completed',
            skipReason: 'already_trusted',
            existingWallet: trustInfo?.walletAddress,
            existingTrustHash: trustInfo?.trustTransactionHash,
            completedAt: Date.now(),
          };

          await runtime.updateMemory({
            id: invitationToUpdate.id,
            content: updatedInvitationContent,
          });

          logger.info(
            `[discover-connection] Updated invitation match status to completed for already-trusted user ${message.entityId}`
          );
        }

        const alreadyTrustedText = `Great! You're already a member of Paren's Circles group with your wallet ${trustInfo?.walletAddress || '[address]'}. 

I'll send your introduction to your match right away!${trustInfo?.trustTransactionHash ? `\n\n🔗 Your original trust transaction: https://gnosisscan.io/tx/${trustInfo.trustTransactionHash}` : ''}`;

        if (callback) {
          await callback({
            text: alreadyTrustedText,
            actions: ['REPLY'],
          });
        }

        // Automatically trigger introduction proposal for already-trusted users
        setTimeout(async () => {
          try {
            const introActions = runtime.actions.filter(
              (action) => action.name === 'INTRO_PROPOSAL'
            );
            if (introActions.length > 0) {
              const introAction = introActions[0];

              const introMessage: Memory = {
                id: `${message.id || 'unknown'}_intro_auto` as `${string}-${string}-${string}-${string}-${string}`,
                entityId: message.entityId,
                roomId: message.roomId,
                content: {
                  text: 'Yes, I would like the introduction',
                  type: 'auto_introduction_request',
                },
                createdAt: Date.now(),
              };

              await introAction.handler(runtime, introMessage, _state, _options, callback);
            }
          } catch (introError) {
            logger.error(
              `[discover-connection] Failed to trigger auto introduction: ${introError}`
            );
          }
        }, 1000);

        return {
          text: alreadyTrustedText,
          success: true,
          values: {
            walletAddress: trustInfo?.walletAddress,
            trustTransactionHash: trustInfo?.trustTransactionHash,
            parenCirclesCA: trustInfo?.circlesGroupCA,
            status: 'already_trusted',
            skipReason: 'already_trusted',
          },
          data: {
            actionName: 'CIRCLES_TRUST',
            skipReason: 'already_trusted',
            existingTrustInfo: trustInfo,
          },
        };
      }

      // Extract wallet address from message
      const messageText = message.content.text || '';
      const addressMatch = messageText.match(/0x[a-fA-F0-9]{40}/);

      if (!addressMatch) {
        const noAddressText =
          "I couldn't find a valid wallet address in your message. Please provide your Circles wallet address (it should start with 0x and be 42 characters long).";

        if (callback) {
          await callback({
            text: noAddressText,
            actions: ['REPLY'],
          });
        }

        return {
          text: noAddressText,
          success: false,
          error: new Error('No valid wallet address found'),
        };
      }

      const walletAddress = addressMatch[0] as Address;

      // Validate the wallet address format
      if (!isAddress(walletAddress)) {
        const invalidAddressText =
          "The wallet address you provided doesn't appear to be valid. Please double-check and provide a valid Ethereum wallet address.";

        if (callback) {
          await callback({
            text: invalidAddressText,
            actions: ['REPLY'],
          });
        }

        return {
          text: invalidAddressText,
          success: false,
          error: new Error('Invalid wallet address format'),
        };
      }

      // Initialize the Circles trust service
      try {
        const circlesTrustService = new CirclesTrustService(runtime);

        // Execute the trust transaction
        const trustResult = await circlesTrustService.trustUser(walletAddress);

        if (!trustResult.success) {
          const trustFailText = `Failed to add you to Paren's Circles group: ${trustResult.error || 'Unknown error'}. Please try again or check if your wallet address is correct.`;

          if (callback) {
            await callback({
              text: trustFailText,
              actions: ['REPLY'],
            });
          }

          return {
            text: trustFailText,
            success: false,
            error: new Error(trustResult.error || 'Trust transaction failed'),
          };
        }

        logger.info(
          `[discover-connection] Successfully trusted wallet ${walletAddress} for user ${message.entityId}`
        );

        // Get Paren's Circles group CA from the service
        const parenCirclesCA = circlesTrustService.getCirclesGroupAddress();

        // Record user as trusted in the trust status service
        const userTrustService = new UserTrustStatusService(runtime);
        try {
          await userTrustService.setUserTrusted(
            message.entityId,
            walletAddress,
            trustResult.transactionHash!,
            parenCirclesCA,
            message.roomId
          );
          logger.info(
            `[discover-connection] Recorded user ${message.entityId} as trusted with wallet ${walletAddress}`
          );
        } catch (trustRecordError) {
          logger.error(
            `[discover-connection] Failed to record trust status for ${message.entityId}: ${trustRecordError}`
          );
          // Continue anyway - don't break the user flow
        }

        // Handle both match-based and invitation-based flows
        const matches = await runtime.getMemories({
          tableName: 'matches',
          count: 50,
        });

        // Check for group_onboarding match
        const matchToUpdate = matches.find((match) => {
          const matchData = match.content as any;
          return (
            (matchData.user1Id === message.entityId || matchData.user2Id === message.entityId) &&
            matchData.status === 'group_onboarding'
          );
        });

        // Check for invitation match (stored as special match with status 'invitation_pending')
        const invitationToUpdate = matches.find((match) => {
          const matchData = match.content as any;
          return (
            matchData.user1Id === message.entityId &&
            matchData.status === 'invitation_pending' &&
            matchData.user2Id === runtime.agentId // Invitation matches use agent ID as placeholder
          );
        });

        if (matchToUpdate?.id) {
          // Update match status from "group_onboarding" to "group_joined"
          const matchData = matchToUpdate.content as any;
          const updatedMatchContent = {
            ...matchData,
            status: 'group_joined',
            trustedWallet: walletAddress,
            trustTransactionHash: trustResult.transactionHash,
          };

          await runtime.updateMemory({
            id: matchToUpdate.id,
            content: updatedMatchContent,
          });

          logger.info(
            `[discover-connection] Updated match status to group_joined for user ${message.entityId}`
          );
        } else if (invitationToUpdate?.id) {
          // Update invitation match status to completed for successful trust transaction
          const invitationData = invitationToUpdate.content as any;
          const updatedInvitationContent = {
            ...invitationData,
            status: 'invitation_completed',
            trustedWallet: walletAddress,
            trustTransactionHash: trustResult.transactionHash,
            completedAt: Date.now(),
          };

          await runtime.updateMemory({
            id: invitationToUpdate.id,
            content: updatedInvitationContent,
          });

          logger.info(
            `[discover-connection] Updated invitation match status to completed for user ${message.entityId}`
          );
        }

        const successText = `You are now member with Paren's Circles group!

You can choose to trust back my group, giving you access to DataDAO governance and daily match services: ${parenCirclesCA}

🔗 View your trust transaction: https://gnosisscan.io/tx/${trustResult.transactionHash}`;

        if (callback) {
          await callback({
            text: successText,
            actions: ['REPLY'],
          });
        }

        // Automatically trigger introduction proposal after successful trust
        // This will be handled by the modified INTRO_PROPOSAL action validation
        // which will now check for "circles_trusted" status
        setTimeout(async () => {
          try {
            const introActions = runtime.actions.filter(
              (action) => action.name === 'INTRO_PROPOSAL'
            );
            if (introActions.length > 0) {
              const introAction = introActions[0];

              // Create a message indicating the user wants to proceed with introduction
              const introMessage: Memory = {
                id: `${message.id || 'unknown'}_intro` as `${string}-${string}-${string}-${string}-${string}`,
                entityId: message.entityId,
                roomId: message.roomId,
                content: {
                  text: 'Yes, I would like the introduction',
                  type: 'introduction_request',
                },
                createdAt: Date.now(),
              };

              await introAction.handler(runtime, introMessage, _state, _options, callback);
            }
          } catch (introError) {
            logger.error(`[discover-connection] Failed to trigger introduction: ${introError}`);
          }
        }, 2000); // Short delay to ensure the success message is sent first

        return {
          text: successText,
          success: true,
          values: {
            walletAddress,
            trustTransactionHash: trustResult.transactionHash,
            parenCirclesCA,
            status: 'group_joined',
          },
          data: {
            actionName: 'CIRCLES_TRUST',
            walletAddress,
            trustTransactionHash: trustResult.transactionHash,
            parenCirclesCA,
          },
        };
      } catch (trustError) {
        logger.error(`[discover-connection] Trust transaction error: ${trustError}`);
        const trustErrorText = `I encountered an error while adding you to Paren's Circles group: ${trustError instanceof Error ? trustError.message : String(trustError)}. Please try again.`;

        if (callback) {
          await callback({
            text: trustErrorText,
            actions: ['REPLY'],
          });
        }

        return {
          text: trustErrorText,
          success: false,
          error: trustError instanceof Error ? trustError : new Error(String(trustError)),
        };
      }
    } catch (error) {
      logger.error(`[discover-connection] Error in Circles trust action: ${error}`);

      const errorText =
        'I encountered an issue while processing your Circles membership. Please try again with your wallet address.';

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
