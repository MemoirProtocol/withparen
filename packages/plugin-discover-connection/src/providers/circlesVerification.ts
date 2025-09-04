import {
  type IAgentRuntime,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
  logger,
} from '@elizaos/core';
import { UserTrustStatusService } from '../services/userTrustStatus.js';

const circlesVerificationProvider: Provider = {
  name: 'CIRCLES_VERIFICATION',
  description:
    'Provides narrative context for users needing Circles group membership or verification',
  get: async (runtime: IAgentRuntime, message: Memory, _state: State): Promise<ProviderResult> => {
    try {
      logger.debug(
        `[circles-verification-provider] DEBUG - Checking context for user ${message.entityId}`
      );

      // First, check if user is already trusted - if so, skip providing any context
      const userTrustService = new UserTrustStatusService(runtime);
      const isUserTrusted = await userTrustService.isUserTrusted(message.entityId);

      if (isUserTrusted) {
        logger.info(
          `[circles-verification-provider] DEBUG - User ${message.entityId} is already trusted, skipping verification context`
        );
        return {
          data: { verificationContext: '' },
        };
      }

      logger.info(
        `[circles-verification-provider] DEBUG - User ${message.entityId} is not trusted, checking match statuses`
      );

      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 50,
      });

      const userMatches = matches.filter((match) => {
        const matchData = match.content as any;
        return (
          matchData.user1Id === message.entityId ||
          matchData.user2Id === message.entityId ||
          (matchData.user1Id === message.entityId && matchData.user2Id === runtime.agentId)
        );
      });

      // Check for matches requiring group membership (exclude completed statuses)
      const completedStatuses = [
        'group_joined',
        'ready_for_introduction',
        'invitation_completed',
        'introduction_outgoing',
        'introduction_incoming',
      ];

      const groupMembershipMatches = userMatches.filter((match) => {
        const matchData = match.content as any;
        const status = matchData.status;
        return (
          (status === 'invitation_pending' || status === 'group_onboarding') &&
          !completedStatuses.includes(status)
        );
      });

      // Check for matches requiring full verification
      const fullVerificationMatches = userMatches.filter((match) => {
        const matchData = match.content as any;
        return matchData.status === 'circles_verification_needed';
      });

      logger.info(
        `[circles-verification-provider] DEBUG - User ${message.entityId}: ${groupMembershipMatches.length} group membership matches, ${fullVerificationMatches.length} verification matches`
      );

      // Case 1: User needs to join Paren's group (has matches but not trusted)
      if (groupMembershipMatches.length > 0) {
        const groupJoinContext = `# Circles Group Membership Required

You have potential connections waiting, but you need to join Paren's Circles group first!

## Current Status
- **Found matches**: You have ${groupMembershipMatches.length} potential connection(s) waiting
- **Next step**: Join Paren's trusted Circles group to unlock introductions

## Two Ways to Join:

### Option 1: Already Verified in Circles Network? 
If you already have 3+ trust connections in the Circles network:
- Simply provide your Circles wallet address
- We'll add you to Paren's group immediately
- You'll get your introduction right away!

### Option 2: Need Circles Network Verification?
If you're new to Circles and don't have 3 trust connections yet:
- We can help you get verified by collecting some basic info
- Other Circles members will review and potentially trust you
- Once you have 3 trust connections, you can join Paren's group

## What to Say:
- **If you have a Circles wallet**: Share your wallet address (starts with 0x)
- **If you need verification**: Say "I need help getting verified in Circles"

Ready to unlock your connections?`;

        logger.info(
          `[circles-verification-provider] DEBUG - Providing group join context for user ${message.entityId}`
        );

        return {
          data: { verificationContext: groupJoinContext },
          text: groupJoinContext,
        };
      }

      // Case 2: User needs Circles network verification
      const verificationMatches = userMatches.filter((match) => {
        const matchData = match.content as any;
        return matchData.status === 'circles_verification_needed';
      });

      if (verificationMatches.length === 0) {
        return {
          data: { verificationContext: '' },
        };
      }

      // Simple narrative context for verification
      const verificationNarrativeContext = `# Circles Network Verification Guide

You're helping a user get verified in the Circles network so they can access their potential connection.

## Your Role
Guide them through collecting verification information in a warm, encouraging way. Keep it simple and explain why each step helps them get connected.

## Information to Collect
1. **Metri Account**: Ask if they have one from https://metri.xyz/ and get their address
2. **Social Links**: Request links that showcase their work/passion (GitHub, Twitter, website, etc.)

## Approach
- Be warm and encouraging - this can feel overwhelming
- Ask one question at a time
- Always explain WHY you need each piece of information
- Emphasize how this helps other Circles members trust them
- Once you have both pieces of info, let them know they're ready for introductions to Circles members

## Context for User
- They need 3 trust connections in Circles network to be verified
- Once verified, they can join Paren's group and get their introduction
- The info you collect helps other members decide whether to trust them

Keep the conversation natural and supportive while gathering what's needed.`;

      logger.info(
        `[circles-verification-provider] DEBUG - Providing verification context for user ${message.entityId}`
      );

      return {
        data: { verificationContext: verificationNarrativeContext },
        text: verificationNarrativeContext,
      };
    } catch (error) {
      logger.error(`[circles-verification-provider] Error getting verification context: ${error}`);
      return {
        data: { verificationContext: '' },
      };
    }
  },
};

export { circlesVerificationProvider };
