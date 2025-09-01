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

import {
  connectionDiscoveryTemplate,
  compatibilityAnalysisTemplate,
} from '../utils/promptTemplates.js';

// Interface removed - using ActionResult directly

/**
 * Connection Discovery Action for Discover-Connection
 * Discovers potential connections based on user's passions, challenges, and preferences
 */
export const createConnectionAction: Action = {
  name: 'CREATE_CONNECTION',
  description:
    'Discovers potential connections for the user based on their persona and connection preferences',
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
      // Check if user has completed onboarding and has persona/connection data
      // Search across all actual persona dimension tables
      const personaDimensions = [
        'persona_demographic',
        'persona_characteristic',
        'persona_routine',
        'persona_goal',
        'persona_experience',
        'persona_persona_relationship',
        'persona_emotional_state',
      ];

      // Search across all actual connection dimension tables
      const connectionDimensions = [
        'connection_desired_type',
        'connection_desired_background',
        'connection_desired_goals',
        'connection_desired_experience',
        'connection_desired_communication',
        'connection_desired_value',
      ];

      // Check for any persona memories across all dimensions
      const personaPromises = personaDimensions.map(async (tableName) => {
        try {
          const memories = await runtime.getMemories({
            roomId: message.roomId,
            tableName,
            count: 1, // Just need to know if any exist
          });
          return memories.length > 0;
        } catch {
          return false;
        }
      });

      // Check for any connection memories across all dimensions
      const connectionPromises = connectionDimensions.map(async (tableName) => {
        try {
          const memories = await runtime.getMemories({
            roomId: message.roomId,
            tableName,
            count: 1, // Just need to know if any exist
          });
          return memories.length > 0;
        } catch {
          return false;
        }
      });

      const [personaResults, connectionResults] = await Promise.all([
        Promise.all(personaPromises),
        Promise.all(connectionPromises),
      ]);

      const hasPersonaData = personaResults.some((result) => result);
      const hasConnectionData = connectionResults.some((result) => result);

      return hasPersonaData || hasConnectionData;
    } catch (error) {
      logger.error(`[discover-connection] Error validating create connection action: ${error}`);
      return false; // Don't allow action if validation fails completely
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
      logger.info(`[discover-connection] Starting connection discovery for user ${message.entityId}`);

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
        .map((m) => `${m.entityId === runtime.agentId ? 'Discover-Connection' : 'User'}: ${m.content.text}`)
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

      // Check available data for connection discovery
      const allPersonaContexts = await runtime.getMemories({
        tableName: 'persona_contexts',
        count: 100,
      });

      logger.info(
        `[discover-connection] Starting connection discovery with ${allPersonaContexts.length} potential matches available`
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

        // Filter out the requesting user and already matched users from potential matches
        potentialMatches = potentialMatches.filter(
          (match) => match.entityId !== message.entityId && !matchedUserIds.has(match.entityId)
        );

        logger.info(
          `[discover-connection] Found ${potentialMatches.length} potential matches (excluding self and existing matches)`
        );
      } catch (error) {
        logger.warn(`[discover-connection] Vector search failed: ${error}`);
        // Continue with empty matches
      }

      if (potentialMatches.length === 0) {
        const noMatchText =
          "There isn't yet enough people to find best possible connection for you now, but I am putting a reminder for myself to check again in few hours and as soon as I find a suitable match, I will let you know!";

        if (callback) {
          await callback({
            text: noMatchText,
            actions: ['REPLY'],
          });

          // Log no match message sent to user
          logger.info(
            `[discover-connection] MESSAGE_SENT_TO_USER: User ${message.entityId} received no match message: "${noMatchText.substring(0, 100)}${noMatchText.length > 100 ? '...' : ''}"`
          );
        }

        return {
          text: noMatchText,
          success: true,
          values: {
            personaContext,
            connectionContext,
            matchScore: 0,
            reasoning: 'No potential matches found - need more users in the system',
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

      // Check for existing matches to prevent duplicates
      if (bestMatch && bestMatch !== 'none') {
        const matchedUserId = bestMatch as UUID;

        // Check if this match already exists
        const existingMatches = await runtime.getMemories({
          tableName: 'matches',
          count: 100,
        });

        const duplicateMatch = existingMatches.find((match) => {
          const matchData = match.content as any;
          return (
            (matchData.user1Id === message.entityId && matchData.user2Id === matchedUserId) ||
            (matchData.user1Id === matchedUserId && matchData.user2Id === message.entityId)
          );
        });

        if (!duplicateMatch) {
          // Create new match record
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
              status: 'match_found', // Initial status
              personaContext,
              connectionContext,
            },
            createdAt: Date.now(),
          };

          await runtime.createMemory(matchRecord, 'matches');
          logger.info(`[discover-connection] Created new match record: ${message.entityId} <-> ${matchedUserId}`);
        } else {
          logger.info(
            `[discover-connection] Match already exists between ${message.entityId} and ${matchedUserId}, skipping duplicate creation`
          );
        }
      }

      if (callback) {
        await callback({
          text: responseText,
          actions: ['REPLY'],
        });

        // Log match result sent to user
        logger.info(
          `[discover-connection] MESSAGE_SENT_TO_USER: User ${message.entityId} received match result: "${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}"`
        );
      }

      return {
        text: responseText,
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
