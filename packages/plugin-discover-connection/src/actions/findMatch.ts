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
  type UUID,
} from '@elizaos/core';

import { UserStatusService, UserStatus, MatchStatus } from '../services/userStatusService.js';

import {
  connectionDiscoveryTemplate,
  compatibilityAnalysisTemplate,
} from '../utils/promptTemplates.js';

// Interface removed - using ActionResult directly

/**
 * Find Match Action for Discover-Connection
 * Discovers potential connections based on user's passions, challenges, and preferences
 */
export const findMatchAction: Action = {
  name: 'FIND_MATCH',
  description:
    'Discovers potential connections for the user based on their persona and connection preferences. call this action when and only when user clearly stated their intention to find a match.',
  similes: [
    'DISCOVER_CONNECTION',
    'FIND_CONNECTION',
    'MATCH_CONNECTION',
    'SEARCH_CONNECTION',
    'FIND_MATCH',
  ],
  examples: [] as ActionExample[][],

  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    try {
      // Check for pending matches that need resolution
      const matches = await runtime.getMemories({
        tableName: 'matches',
        count: 50,
      });

      const userMatches = matches.filter((match) => {
        const matchData = match.content as any;
        return matchData.user1Id === message.entityId || matchData.user2Id === message.entityId;
      });

      // Check for matches that need user attention (using new status system)
      const pendingMatches = userMatches.filter((match) => {
        const matchData = match.content as any;
        return (
          matchData.status === MatchStatus.MATCH_FOUND ||
          matchData.status === MatchStatus.PROPOSAL_PENDING
        );
      });

      // If user has pending matches that need attention, don't allow more FIND_MATCH calls
      if (pendingMatches.length > 0) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`[discover-connection] Error validating find match action: ${error}`);
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
        `[discover-connection] Starting connection discovery for user ${message.entityId}`
      );

      // Get user's persona and connection memories across all dimension tables
      const personaDimensions = [
        'persona_demographic',
        'persona_characteristic',
        'persona_routine',
        'persona_goal',
        'persona_experience',
        'persona_persona_relationship',
        'persona_emotional_state',
      ];

      const connectionDimensions = [
        'connection_desired_type',
        'connection_desired_background',
        'connection_desired_goals',
        'connection_desired_experience',
        'connection_desired_communication',
        'connection_desired_value',
      ];

      // Fetch persona memories from all dimensions
      const personaMemoryPromises = personaDimensions.map(async (tableName) => {
        try {
          const memories = await runtime.getMemories({
            roomId: message.roomId,
            tableName,
            count: 10,
          });
          return memories;
        } catch (error) {
          logger.warn(`Failed to get memories from ${tableName}: ${error}`);
          return [];
        }
      });

      // Fetch connection memories from all dimensions
      const connectionMemoryPromises = connectionDimensions.map(async (tableName) => {
        try {
          const memories = await runtime.getMemories({
            roomId: message.roomId,
            tableName,
            count: 10,
          });
          return memories;
        } catch (error) {
          logger.warn(`Failed to get memories from ${tableName}: ${error}`);
          return [];
        }
      });

      const [personaMemoryResults, connectionMemoryResults] = await Promise.all([
        Promise.all(personaMemoryPromises),
        Promise.all(connectionMemoryPromises),
      ]);

      // Flatten and get the most recent 20 memories from each category
      const allPersonaMemories = personaMemoryResults
        .flat()
        .filter((memory, index, self) => index === self.findIndex((t) => t.id === memory.id))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 20);

      const allConnectionMemories = connectionMemoryResults
        .flat()
        .filter((memory, index, self) => index === self.findIndex((t) => t.id === memory.id))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 20);

      const recentMessages = await runtime.getMemories({
        roomId: message.roomId,
        tableName: 'messages',
        count: 10,
      });

      // Format memories for the prompt
      const personaMemoryText = allPersonaMemories.map((m) => m.content.text).join('\n');

      const connectionMemoryText = allConnectionMemories.map((m) => m.content.text).join('\n');

      const recentMessagesText = recentMessages
        .map(
          (m) =>
            `${m.entityId === runtime.agentId ? 'Discover-Connection' : 'User'}: ${m.content.text}`
        )
        .join('\n');

      // Generate persona and connection contexts
      const prompt = connectionDiscoveryTemplate
        .replace('{{personaMemory}}', personaMemoryText || 'No persona information available yet.')
        .replace(
          '{{connectionMemory}}',
          connectionMemoryText || 'No connection preferences available yet.'
        )
        .replace('{{recentMessages}}', recentMessagesText);

      const response = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt,
      });

      logger.debug(`[discover-connection] Discovery response: ${response}`);

      const parsedResponse = parseKeyValueXml(response);

      if (!parsedResponse) {
        logger.error('[discover-connection] Failed to parse discovery response');
        const fallbackText =
          "I'm analyzing your background and preferences to find great connections. Let me gather a bit more information first. What specific challenges are you facing that you'd like help with?";

        if (callback) {
          await callback({
            text: fallbackText,
            actions: ['REPLY'],
          });

          // Log error message sent to user
          logger.info(
            `[discover-connection] MESSAGE_SENT_TO_USER: User ${message.entityId} received error message: "${fallbackText.substring(0, 100)}${fallbackText.length > 100 ? '...' : ''}"`
          );
        }

        return {
          text: fallbackText,
          success: false,
          error: new Error('Failed to parse discovery response'),
        };
      }

      const personaContext = parsedResponse.personaContext;
      const connectionContext = parsedResponse.connectionContext;

      if (!personaContext || !connectionContext) {
        logger.error('[discover-connection] Missing persona or connection context in response');
        const fallbackText =
          "I need to understand you better before I can find great connections. Can you tell me more about what you're working on and what kind of people would be most helpful to you?";

        if (callback) {
          await callback({
            text: fallbackText,
            actions: ['REPLY'],
          });

          // Log fallback message sent to user
          logger.info(
            `[discover-connection] MESSAGE_SENT_TO_USER: User ${message.entityId} received fallback message: "${fallbackText.substring(0, 100)}${fallbackText.length > 100 ? '...' : ''}"`
          );
        }

        return {
          text: fallbackText,
          success: false,
          error: new Error('Missing persona or connection context'),
        };
      }

      // Replace existing contexts to avoid duplicates in vector search
      // First, delete any existing persona_contexts for this user
      const existingPersonaContexts = await runtime.getMemories({
        tableName: 'persona_contexts',
        entityId: message.entityId,
        roomId: message.roomId,
        count: 100,
      });

      // Delete existing persona contexts to prevent duplicates in search
      for (const existingContext of existingPersonaContexts) {
        if (existingContext.id) {
          await runtime.deleteMemory(existingContext.id);
        }
      }

      // Create new persona context with embedding for vector search
      const personaMemoryWithEmbedding = await runtime.addEmbeddingToMemory({
        entityId: message.entityId,
        agentId: runtime.agentId,
        roomId: message.roomId,
        content: {
          text: personaContext,
          type: 'persona_context',
        },
        createdAt: Date.now(),
      });

      await runtime.createMemory(personaMemoryWithEmbedding, 'persona_contexts', true);

      // Store connection context (for historical tracking, no embedding needed)
      await runtime.createMemory(
        {
          entityId: message.entityId,
          agentId: runtime.agentId,
          roomId: message.roomId,
          content: {
            text: connectionContext,
            type: 'connection_context',
          },
          createdAt: Date.now(),
        },
        'connection_contexts'
      );

      // Check for existing matches first to avoid duplicate work
      const existingMatches = await runtime.getMemories({
        tableName: 'matches',
        count: 100,
      });

      // Filter out users that have already been matched with this user
      const matchedUserIds = new Set<UUID>();
      existingMatches.forEach((match) => {
        const matchData = match.content as any;
        if (matchData.user1Id === message.entityId) {
          matchedUserIds.add(matchData.user2Id);
        } else if (matchData.user2Id === message.entityId) {
          matchedUserIds.add(matchData.user1Id);
        }
      });

      logger.info(
        `[discover-connection] Found ${matchedUserIds.size} existing matches for user ${message.entityId}`
      );

      // Get all GROUP_MEMBER users first - only group members can be matched
      const userStatusService = new UserStatusService(runtime);
      const allGroupMemberIds = await userStatusService.getUsersByStatus(
        UserStatus.GROUP_MEMBER,
        200
      );
      const groupMemberIds = new Set(allGroupMemberIds);

      logger.info(
        `[discover-connection] Found ${groupMemberIds.size} group members for matching pool`
      );

      // Check requesting user's group membership early to handle no-match scenarios appropriately
      const requestingUserStatus = await userStatusService.getUserStatus(message.entityId);
      const isUserGroupMember = requestingUserStatus === UserStatus.GROUP_MEMBER;

      logger.info(
        `[discover-connection] DEBUG - FIND_MATCH User ${message.entityId} group membership: ${isUserGroupMember} (status: ${requestingUserStatus})`
      );

      // Check available data for connection discovery
      const allPersonaContexts = await runtime.getMemories({
        tableName: 'persona_contexts',
        count: 100,
      });

      logger.info(
        `[discover-connection] Starting connection discovery with ${allPersonaContexts.length} total persona contexts, filtering to GROUP_MEMBER users only`
      );

      // Perform vector similarity search for potential matches
      let potentialMatches: Memory[] = [];
      try {
        logger.debug(`[discover-connection] Generating embedding for similarity search...`);

        // Generate embedding from connection context for similarity search
        const embedding = await runtime.useModel(ModelType.TEXT_EMBEDDING, {
          text: connectionContext,
        });

        logger.debug(`[discover-connection] Searching for compatible connections...`);
        potentialMatches = await runtime.searchMemories({
          embedding,
          tableName: 'persona_contexts',
          count: 10,
          match_threshold: 0.4, // Reasonable threshold for good matches
        });

        // Filter out the requesting user, already matched users, and non-group members from potential matches
        potentialMatches = potentialMatches.filter(
          (match) =>
            match.entityId !== message.entityId &&
            !matchedUserIds.has(match.entityId) &&
            groupMemberIds.has(match.entityId)
        );

        logger.info(
          `[discover-connection] Found ${potentialMatches.length} potential matches (excluding self, existing matches, and non-group members)`
        );
      } catch (error) {
        logger.warn(`[discover-connection] Vector search failed: ${error}`);
        // Continue with empty matches
      }

      if (potentialMatches.length === 0) {
        let noMatchText: string;

        if (!isUserGroupMember) {
          // For non-members: invite them to join the group (no fake match record needed)
          noMatchText =
            groupMemberIds.size === 0
              ? "There aren't any available matches in my network right now. However, you can already join my Circles group!\n\nAs a member, you'll:\n• Get matching with other members\n• Be discoverable by new members seeking connections like you\n• Being part of my DataDAO\n\nWould you like to join? If you're already verified in Circles, please share your wallet address. If not, I can help you get the trust connections needed for verification."
              : "There aren't any available matches in my network right now. However, you can already join my Circles group!\n\nAs a member, you'll:\n• Get matching with other members\n• Be discoverable by new members seeking connections like you\n• Being part of my DataDAO\n\nWould you like to join? If you're already verified in Circles, please share your wallet address. If not, I can help you get the trust connections needed for verification.";

          // Update user status to unverified_member since they found no matches but need to join group
          try {
            const userStatusService = new UserStatusService(runtime);
            await userStatusService.transitionUserStatus(
              message.entityId,
              UserStatus.UNVERIFIED_MEMBER
            );
            logger.info(
              `[discover-connection] DEBUG - FIND_MATCH Transitioned user ${message.entityId} to UNVERIFIED_MEMBER status (no matches found)`
            );
          } catch (error) {
            logger.error(
              `[discover-connection] Failed to transition user status for ${message.entityId}: ${error}`
            );
            // Continue anyway - don't break the user flow
          }
        } else {
          // For existing group members: standard no-match message
          noMatchText =
            groupMemberIds.size <= 1
              ? "There aren't any other group members available for matching right now. Encourage others to join Paren's Circles group to expand the matching pool!"
              : "I couldn't find a compatible match among the current group members, but I'll keep checking as more people join the group. I'll notify you when I find a suitable connection!";
        }

        if (callback) {
          await callback({
            text: noMatchText,
            actions: ['REPLY'],
          });

          // Log no match message sent to user with membership info
          logger.info(
            `[discover-connection] MESSAGE_SENT_TO_USER: User ${message.entityId} (group member: ${isUserGroupMember}) received no match message: "${noMatchText.substring(0, 100)}${noMatchText.length > 100 ? '...' : ''}"`
          );
        }

        return {
          text: noMatchText,
          success: true,
          values: {
            personaContext,
            connectionContext,
            matchScore: 0,
            reasoning: isUserGroupMember
              ? 'No potential matches found among group members - need more group members'
              : 'No matches found - user invited to join group to expand opportunities',
            isUserGroupMember,
          },
        };
      }

      // Get connection contexts for all potential matches for mutual compatibility check
      const candidateProfiles = await Promise.all(
        potentialMatches.slice(0, 10).map(async (match, index) => {
          const matchConnectionContext = await runtime.getMemories({
            entityId: match.entityId,
            tableName: 'connection_contexts',
            count: 1,
          });

          return `Match Option ${index + 1}:
ID: ${match.entityId}
Persona: ${match.content.text}
Looking for: ${matchConnectionContext.length > 0 ? matchConnectionContext[0].content.text : 'Not specified'}`;
        })
      );

      // Analyze compatibility with all candidates in one prompt
      const compatibilityPrompt = compatibilityAnalysisTemplate
        .replace('{{userPersonaContext}}', personaContext)
        .replace('{{userConnectionContext}}', connectionContext)
        .replace('{{candidateProfiles}}', candidateProfiles.join('\n\n'));

      const compatibilityResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt: compatibilityPrompt,
      });

      const compatibilityParsed = parseKeyValueXml(compatibilityResponse);

      if (!compatibilityParsed) {
        logger.error('[discover-connection] Failed to parse compatibility response');
        const errorText =
          "I found some potential matches but had trouble analyzing compatibility. Let me try a different approach. What's the most important thing you're looking for in a connection right now?";

        if (callback) {
          await callback({
            text: errorText,
            actions: ['REPLY'],
          });

          // Log compatibility error message sent to user
          logger.info(
            `[discover-connection] MESSAGE_SENT_TO_USER: User ${message.entityId} received compatibility error: "${errorText.substring(0, 100)}${errorText.length > 100 ? '...' : ''}"`
          );
        }

        return {
          text: errorText,
          success: false,
          error: new Error('Failed to parse compatibility response'),
        };
      }

      const bestMatch = compatibilityParsed.bestMatch;
      const compatibilityScorePlusReasoning =
        compatibilityParsed.compatibilityScorePlusReasoning || '';
      const responseText =
        compatibilityParsed.text || 'I analyzed your profile for potential matches.';

      // Extract compatibility score from the combined field (expecting format like "85 - explanation...")
      const scoreMatch = compatibilityScorePlusReasoning.match(/^(\d+)/);
      const compatibilityScore = scoreMatch ? parseInt(scoreMatch[1]) : 0;

      logger.info(
        `[discover-connection] Connection analysis complete. ${bestMatch !== 'none' ? `Found compatible match with score: ${compatibilityScore}` : 'No suitable matches found'}`
      );

      // Generate additional membership message if needed for non-group members with matches
      let finalResponseText = responseText;

      if (bestMatch && bestMatch !== 'none') {
        // We already have isUserGroupMember from earlier check

        // Only generate membership message for non-group members
        if (!isUserGroupMember) {
          // Static membership guidance message for users not in Paren's group
          const membershipMessage =
            "Now before I introduce you, I like to add you to my network by trusting you into my Circles group. If you're already a member in Circles network, please share your Metri account address so I can add you. If not, I still match you with like minded people who may also invite you to Circles network.";

          finalResponseText = responseText + '\n\n' + membershipMessage;
        }
      }

      // Check for existing matches to prevent duplicates
      if (bestMatch && bestMatch !== 'none') {
        const matchedUserId = bestMatch as UUID;

        // Check if this match already exists
        const existingMatches = await runtime.getMemories({
          tableName: 'matches',
          count: 100,
        });

        // Check for ANY existing match between these users (any status)
        const duplicateMatch = existingMatches.find((match) => {
          const matchData = match.content as any;
          return (
            (matchData.user1Id === message.entityId && matchData.user2Id === matchedUserId) ||
            (matchData.user1Id === matchedUserId && matchData.user2Id === message.entityId)
          );
        });

        logger.info(
          `[discover-connection] DEBUG - FIND_MATCH Duplicate check: ${duplicateMatch ? 'FOUND existing match' : 'No existing match'} between ${message.entityId} and ${matchedUserId}`
        );

        if (!duplicateMatch) {
          // Set match status - all new matches start with MATCH_FOUND
          const matchStatus = MatchStatus.MATCH_FOUND;

          logger.info(
            `[discover-connection] DEBUG - FIND_MATCH MATCH STATUS: User ${message.entityId} matched with ${matchedUserId}, setting status: "${matchStatus}"`
          );

          // Get matched user's contexts for proper storage
          const matchedUserPersonaContexts = await runtime.getMemories({
            entityId: matchedUserId,
            tableName: 'persona_contexts',
            count: 1,
          });

          const matchedUserConnectionContexts = await runtime.getMemories({
            entityId: matchedUserId,
            tableName: 'connection_contexts',
            count: 1,
          });

          const matchedUserPersonaContext =
            matchedUserPersonaContexts.length > 0
              ? matchedUserPersonaContexts[0].content.text
              : 'Not available';

          const matchedUserConnectionContext =
            matchedUserConnectionContexts.length > 0
              ? matchedUserConnectionContexts[0].content.text
              : 'Not specified';

          // Create new match record with both users' contexts properly stored
          const matchRecord = {
            entityId: message.entityId, // The requesting user
            agentId: runtime.agentId,
            roomId: message.roomId,
            content: {
              text: `Match found between ${message.entityId} and ${matchedUserId} with compatibility score ${compatibilityScore}`,
              type: 'match_record',
              user1Id: message.entityId,
              user2Id: matchedUserId,
              compatibilityScore,
              reasoning: compatibilityScorePlusReasoning,
              status: matchStatus,
              proposalInitiator: null, // No proposal initiated yet
              // Store both users' contexts clearly
              user1PersonaContext: personaContext, // Requesting user's persona
              user1ConnectionContext: connectionContext, // What requesting user is looking for
              user2PersonaContext: matchedUserPersonaContext, // Matched user's persona
              user2ConnectionContext: matchedUserConnectionContext, // What matched user is looking for
              // Keep old fields for backward compatibility
              personaContext,
              connectionContext,
            },
            createdAt: Date.now(),
          };

          await runtime.createMemory(matchRecord, 'matches');
          logger.info(
            `[discover-connection] DEBUG - FIND_MATCH Created match record: ${message.entityId} <-> ${matchedUserId} status="${matchStatus}"`
          );

          // Update user status to unverified_member (they've found a match but may need verification)
          const userStatusService = new UserStatusService(runtime);
          await userStatusService.transitionUserStatus(
            message.entityId,
            UserStatus.UNVERIFIED_MEMBER
          );
        } else {
          logger.info(
            `[discover-connection] Match already exists between ${message.entityId} and ${matchedUserId}, skipping duplicate creation`
          );
        }
      }

      if (callback) {
        await callback({
          text: finalResponseText,
          actions: ['REPLY'],
        });

        // Log match result sent to user
        logger.info(
          `[discover-connection] MESSAGE_SENT_TO_USER: User ${message.entityId} received match result: "${finalResponseText.substring(0, 100)}${finalResponseText.length > 100 ? '...' : ''}"`
        );
      }

      return {
        text: finalResponseText,
        success: true,
        values: {
          personaContext,
          connectionContext,
          matchedUserId: bestMatch && bestMatch !== 'none' ? (bestMatch as UUID) : undefined,
          matchScore: compatibilityScore,
          reasoning: compatibilityScorePlusReasoning,
        },
      };
    } catch (error) {
      logger.error(`[discover-connection] Error in connection discovery: ${error}`);

      const errorText =
        "I encountered an issue while searching for connections. Let me help you in a different way - what's one specific type of person you'd most like to connect with right now?";

      if (callback) {
        await callback({
          text: errorText,
          actions: ['REPLY'],
        });

        // Log error message sent to user
        logger.info(
          `[discover-connection] MESSAGE_SENT_TO_USER: User ${message.entityId} received error: "${errorText.substring(0, 100)}${errorText.length > 100 ? '...' : ''}"`
        );
      }

      return {
        text: errorText,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};
