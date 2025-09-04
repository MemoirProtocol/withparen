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
import { UserStatusService, UserStatus } from '../services/userStatusService.js';

/**
 * Join Group Action for Discover-Connection
 * Handles user wallet address collection, executes trust transaction to add them to Paren's Circles group,
 * and triggers introduction proposal after successful trust
 */
export const joinGroupAction: Action = {
  name: 'JOIN_GROUP',
  description:
    "Handles wallet address collection and trust transaction to add user to Paren's Circles group",
  similes: ['CIRCLES_TRUST', 'TRUST_WALLET', 'ADD_TO_GROUP', 'JOIN_CIRCLES'],
  examples: [] as ActionExample[][],

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    try {
      const userStatusService = new UserStatusService(runtime);
      const userStatus = await userStatusService.getUserStatus(message.entityId);
      
      // Allow ONBOARDING, UNVERIFIED_MEMBER, and VERIFICATION_PENDING statuses
      if (userStatus !== UserStatus.ONBOARDING && 
          userStatus !== UserStatus.UNVERIFIED_MEMBER && 
          userStatus !== UserStatus.VERIFICATION_PENDING) {
        return false;
      }

      // Check if user is providing a wallet address
      const messageText = message.content.text || '';
      const hasWalletAddress = messageText.includes('0x') && messageText.length >= 40;

      if (!hasWalletAddress) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`[discover-connection] Error validating join group action: ${error}`);
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
      logger.info(`[discover-connection] Processing group join for user ${message.entityId}`);

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
            
            // Ensure user status is GROUP_MEMBER
            const userStatusService = new UserStatusService(runtime);
            await userStatusService.transitionUserStatus(message.entityId, UserStatus.GROUP_MEMBER);
            logger.info(
              `[discover-connection] Ensured user ${message.entityId} has GROUP_MEMBER status`
            );
          } catch (trustRecordError) {
            logger.error(
              `[discover-connection] Failed to ensure trust record for already-trusted user ${message.entityId}: ${trustRecordError}`
            );
            // Continue anyway - don't break the user flow
          }
        }

        const alreadyTrustedText = `Great! You're already a member of Paren's Circles group with your wallet ${trustInfo?.walletAddress || '[address]'}. 

You're now part of our DataDAO and have access to daily match services!${trustInfo?.trustTransactionHash ? `\n\n🔗 Your trust transaction: https://gnosisscan.io/tx/${trustInfo.trustTransactionHash}` : ''}`;

        if (callback) {
          await callback({
            text: alreadyTrustedText,
            actions: ['REPLY'],
          });
        }

        return {
          text: alreadyTrustedText,
          success: true,
          values: {
            walletAddress: trustInfo?.walletAddress,
            trustTransactionHash: trustInfo?.trustTransactionHash,
            parenCirclesCA: trustInfo?.circlesGroupCA,
            status: 'already_member',
            skipReason: 'already_trusted',
          },
          data: {
            actionName: 'JOIN_GROUP',
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
          
          // Transition user status to GROUP_MEMBER
          const userStatusService = new UserStatusService(runtime);
          await userStatusService.transitionUserStatus(message.entityId, UserStatus.GROUP_MEMBER);
          logger.info(
            `[discover-connection] Transitioned user ${message.entityId} to GROUP_MEMBER status`
          );

          // Store wallet address in memory with type 'wallet_address'
          try {
            const walletAddressRecord = {
              entityId: message.entityId,
              agentId: runtime.agentId,
              roomId: message.roomId,
              content: {
                walletAddress: walletAddress,
                type: 'wallet_address',
                text: `Wallet address for user ${message.entityId}: ${walletAddress}`,
                trustTransactionHash: trustResult.transactionHash,
                trustedAt: Date.now(),
                parenCirclesCA: parenCirclesCA,
              },
              createdAt: Date.now(),
            };

            await runtime.createMemory(walletAddressRecord, 'memories');
            logger.info(
              `[discover-connection] Stored wallet address ${walletAddress} in memory for user ${message.entityId}`
            );
          } catch (walletStorageError) {
            logger.error(
              `[discover-connection] Failed to store wallet address for ${message.entityId}: ${walletStorageError}`
            );
            // Continue anyway - don't break the user flow
          }
        } catch (trustRecordError) {
          logger.error(
            `[discover-connection] Failed to record trust status for ${message.entityId}: ${trustRecordError}`
          );
          // Continue anyway - don't break the user flow
        }

        const successText = `Welcome to Paren's Circles group! 🎉

You're now a member with access to:
• DataDAO governance participation
• Daily personalized match services  
• Trusted network benefits

You can choose to trust back my group for enhanced features: ${parenCirclesCA}

🔗 View your trust transaction: https://gnosisscan.io/tx/${trustResult.transactionHash}`;

        if (callback) {
          await callback({
            text: successText,
            actions: ['REPLY'],
          });
        }

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
            actionName: 'JOIN_GROUP',
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
      logger.error(`[discover-connection] Error in join group action: ${error}`);

      const errorText =
        'I encountered an issue while processing your group membership. Please try again with your wallet address.';

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