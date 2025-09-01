import { type IAgentRuntime, Memory, ModelType, Provider, State } from '@elizaos/core';
import { logger } from '@elizaos/core';

/**
 * Formats an array of connection memories into a single string with each memory content text separated by a new line.
 *
 * @param {Memory[]} connectionMemories - An array of Memory objects to be formatted.
 * @returns {string} A single string containing all connection memory content text with new lines separating each text.
 */
function formatConnectionMemories(connectionMemories: Memory[]) {
  return connectionMemories
    .reverse()
    .map((memory: Memory) => memory.content.text)
    .join('\n');
}

/**
 * Provider for fetching human connection insights.
 * Retrieves relevant connection memories from various dimensions: profile, routine, goal, experience, communication, emotion.
 */
const connectionMemoryProvider: Provider = {
  name: 'CONNECTION_MEMORY',
  description:
    'Insights about human connections and relationships the user has mentioned (Profile, Routines, Goals, Experiences, Communication, Emotions)',
  position: 2,
  dynamic: true,
  get: async (runtime: IAgentRuntime, message: Memory, _state?: State) => {
    try {
      // Get recent messages for context
      const recentMessages = await runtime.getMemories({
        tableName: 'messages',
        roomId: message.roomId,
        count: 10,
        unique: false,
      });

      // Join the text of the last 5 messages for embedding
      const last5Messages = recentMessages
        .slice(-5)
        .map((message) => message.content.text)
        .join('\n');

      const embedding = await runtime.useModel(ModelType.TEXT_EMBEDDING, {
        text: last5Messages,
      });

      // Search across all connection dimension tables
      const connectionDimensions = [
        'connection_profile',
        'connection_routine',
        'connection_goal',
        'connection_experience',
        'connection_communication',
        'connection_emotion',
      ];

      // Fetch relevant memories from all connection dimensions in parallel
      const connectionMemoryPromises = connectionDimensions.map(async (tableName) => {
        try {
          logger.debug(`Searching connection table: ${tableName} for room: ${message.roomId}`);
          const memories = await runtime.searchMemories({
            tableName,
            embedding,
            roomId: message.roomId,
            worldId: message.worldId,
            count: 3, // Get top 3 from each dimension
            query: message.content.text,
          });
          logger.debug(`Found ${memories.length} memories in ${tableName}`);
          return memories;
        } catch (error) {
          logger.warn(`Failed to search ${tableName}: ${error}`);
          return [];
        }
      });

      const connectionMemoryResults = await Promise.all(connectionMemoryPromises);

      // Flatten and deduplicate all connection memories
      let allConnectionMemories = connectionMemoryResults
        .flat()
        .filter((memory, index, self) => index === self.findIndex((t) => t.id === memory.id))
        .slice(0, 12); // Limit to top 12 most relevant

      logger.debug(`Total connection memories found via search: ${allConnectionMemories.length}`);

      // If no memories found via embedding search, try getting recent memories directly
      if (allConnectionMemories.length === 0) {
        logger.debug(
          'No connection memories found via embedding search, trying direct retrieval...'
        );
        const fallbackPromises = connectionDimensions.map(async (tableName) => {
          try {
            const memories = await runtime.getMemories({
              tableName,
              roomId: message.roomId,
              count: 5,
              unique: false,
            });
            logger.debug(`Found ${memories.length} memories in ${tableName} via direct retrieval`);
            return memories;
          } catch (error) {
            logger.warn(`Failed to get memories from ${tableName}: ${error}`);
            return [];
          }
        });

        const fallbackResults = await Promise.all(fallbackPromises);
        allConnectionMemories = fallbackResults
          .flat()
          .filter((memory, index, self) => index === self.findIndex((t) => t.id === memory.id))
          .slice(0, 12);

        logger.debug(
          `Total connection memories found via fallback: ${allConnectionMemories.length}`
        );
      }

      if (allConnectionMemories.length === 0) {
        return {
          values: {
            connectionMemory: '',
          },
          data: {
            connectionMemory: allConnectionMemories,
          },
          text: 'No connection insights available.',
        };
      }

      const formattedConnectionMemories = formatConnectionMemories(allConnectionMemories);

      // Create generic headline since we don't have MemgraphService in plugin-serenapp
      const headline = `# Human connection insights that ${runtime.character.name || 'the agent'} has learned:`;

      const text = `${headline}\n${formattedConnectionMemories}`;

      return {
        values: {
          connectionMemory: formattedConnectionMemories,
        },
        data: {
          connectionMemory: allConnectionMemories,
        },
        text,
      };
    } catch (error) {
      logger.error(`Error in connectionMemoryProvider: ${error}`);
      return {
        values: {
          connectionMemory: '',
        },
        data: {
          connectionMemory: [],
        },
        text: 'Error retrieving connection insights.',
      };
    }
  },
};

export { connectionMemoryProvider, formatConnectionMemories };
