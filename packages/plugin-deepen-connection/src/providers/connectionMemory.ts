import { type IAgentRuntime, Memory, ModelType, Provider, State } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { MemgraphService } from '../services/memgraph.js';

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
      // Initialize Memgraph service to get connection partner information
      const memgraphService = new MemgraphService();
      await memgraphService.connect();

      // Get the current user's ID from the message
      const userId = message.entityId;
      let connectionPartners: string[] = [];
      let currentUserName = '';

      try {
        // Get the Person node to find their name
        const person = await memgraphService.getPersonByUserId(userId);
        currentUserName = person?.name || 'User';

        // Get HumanConnections for this user to find their partner(s)
        const humanConnections = await memgraphService.getHumanConnections(userId);

        if (humanConnections.length > 0) {
          // Get the first connection's partners (assuming one primary connection for now)
          const connection = humanConnections[0];
          connectionPartners = connection.partners.filter(
            (partner) => partner.toLowerCase() !== currentUserName.toLowerCase()
          );
          logger.debug(
            `Found connection partners: ${connectionPartners.join(', ')} for user: ${currentUserName}`
          );
        }
      } catch (error) {
        logger.warn(
          `Failed to get connection partner information: ${error instanceof Error ? error.message : String(error)}`
        );
      } finally {
        await memgraphService.disconnect();
      }

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
          logger.warn(
            `Failed to search ${tableName}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
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
            logger.warn(
              `Failed to get memories from ${tableName}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
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
        // Create personalized "no insights" message
        let noInsightsText = '';
        if (connectionPartners.length > 0 && currentUserName) {
          const partnerName = connectionPartners[0];
          noInsightsText = `# ${currentUserName} and ${partnerName} seek deepening the connection, but no specific insights have been learned yet.`;
        } else {
          noInsightsText = 'No connection insights available.';
        }

        return {
          values: {
            connectionMemory: '',
          },
          data: {
            connectionMemory: allConnectionMemories,
          },
          text: noInsightsText,
        };
      }

      const formattedConnectionMemories = formatConnectionMemories(allConnectionMemories);

      // Create personalized headline based on connection partners
      let headline = '';
      if (connectionPartners.length > 0 && currentUserName) {
        const partnerName = connectionPartners[0]; // Use first partner for now
        headline = `# ${currentUserName} and ${partnerName} seek deepening the connection and here are the insights that ${runtime.character.name || 'the agent'} has learned while talking with ${currentUserName} about the connection with ${partnerName}:`;
      } else {
        // Fallback to generic headline if no connection partners found
        headline = `# Human connection insights that ${runtime.character.name || 'the agent'} has learned:`;
      }

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
      logger.error(
        `Error in connectionMemoryProvider: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
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
