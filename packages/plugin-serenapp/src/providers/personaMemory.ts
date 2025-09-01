import { type IAgentRuntime, Memory, ModelType, Provider, State } from '@elizaos/core';
import { logger } from '@elizaos/core';

/**
 * Formats an array of persona memories into a single string with each memory content text separated by a new line.
 *
 * @param {Memory[]} personaMemories - An array of Memory objects to be formatted.
 * @returns {string} A single string containing all persona memory content text with new lines separating each text.
 */
function formatPersonaMemories(personaMemories: Memory[]) {
  return personaMemories
    .reverse()
    .map((memory: Memory) => memory.content.text)
    .join('\n');
}

/**
 * Provider for fetching persona insights using the PEACOCK framework.
 * Retrieves relevant persona memories from various dimensions: demographic, characteristic, routine, goal, experience, persona_relationship, emotional_state.
 */
const personaMemoryProvider: Provider = {
  name: 'PERSONA_MEMORY',
  description:
    'Persona insights about the user using PEACOCK framework (Demographics, Characteristics, Routines, Goals, Experiences, Relationships, Emotional States)',
  position: 3,
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

      // Search across all persona dimension tables
      const personaDimensions = [
        'persona_demographic',
        'persona_characteristic',
        'persona_routine',
        'persona_goal',
        'persona_experience',
        'persona_persona_relationship',
        'persona_emotional_state',
      ];

      // Fetch relevant memories from all persona dimensions in parallel
      const personaMemoryPromises = personaDimensions.map(async (tableName) => {
        try {
          logger.debug(`Searching persona table: ${tableName} for room: ${message.roomId}`);
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

      const personaMemoryResults = await Promise.all(personaMemoryPromises);

      // Flatten and deduplicate all persona memories
      let allPersonaMemories = personaMemoryResults
        .flat()
        .filter((memory, index, self) => index === self.findIndex((t) => t.id === memory.id))
        .slice(0, 15); // Limit to top 15 most relevant

      logger.debug(`Total persona memories found via search: ${allPersonaMemories.length}`);

      // If no memories found via embedding search, try getting recent memories directly
      if (allPersonaMemories.length === 0) {
        logger.debug('No memories found via embedding search, trying direct retrieval...');
        const fallbackPromises = personaDimensions.map(async (tableName) => {
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
        allPersonaMemories = fallbackResults
          .flat()
          .filter((memory, index, self) => index === self.findIndex((t) => t.id === memory.id))
          .slice(0, 15);

        logger.debug(`Total persona memories found via fallback: ${allPersonaMemories.length}`);
      }

      if (allPersonaMemories.length === 0) {
        return {
          values: {
            personaMemory: '',
          },
          data: {
            personaMemory: allPersonaMemories,
          },
          text: 'No persona insights available.',
        };
      }

      const formattedPersonaMemories = formatPersonaMemories(allPersonaMemories);

      const text =
        '# Persona insights that {{agentName}} has learned:\n{{formattedPersonaMemories}}'
          .replace('{{agentName}}', runtime.character.name || '')
          .replace('{{formattedPersonaMemories}}', formattedPersonaMemories);

      return {
        values: {
          personaMemory: formattedPersonaMemories,
        },
        data: {
          personaMemory: allPersonaMemories,
        },
        text,
      };
    } catch (error) {
      logger.error(`Error in personaMemoryProvider: ${error}`);
      return {
        values: {
          personaMemory: '',
        },
        data: {
          personaMemory: [],
        },
        text: 'Error retrieving persona insights.',
      };
    }
  },
};

export { personaMemoryProvider, formatPersonaMemories };
