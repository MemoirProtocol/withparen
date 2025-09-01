import { type IAgentRuntime, type Memory, type UUID, type Provider, logger } from '@elizaos/core';

/**
 * Format shared relationship memories for the current user
 * This provides the same relationship context used in daily planning to the message handler
 */
export async function formatSharedRelationshipMemories(
  runtime: IAgentRuntime,
  userId: UUID
): Promise<string> {
  try {
    // Define which types should fetch multiple memories
    const singleValueTypes = ['shared_relationship_stage', 'shared_relationship_length'];
    const multiValueTypes = [
      'shared_relationship_dynamic',
      'shared_relationship_pattern',
      'shared_relationship_Patterns', // Active challenges (linter changed this)
      'shared_relationship_goals',
      'shared_relationship_cultural_context',
    ];

    const contextParts: string[] = [];

    // Fetch single value memories (stage and length)
    for (const type of singleValueTypes) {
      const memories = await runtime.getMemories({
        tableName: 'memories',
        entityId: userId,
        count: 10, // Get more to filter
        unique: false,
      });

      // Filter by metadata type
      const filteredMemories = memories.filter(
        (m) => m.metadata && (m.metadata as any).type === type
      );

      if (filteredMemories.length > 0 && filteredMemories[0].content.text) {
        const value = filteredMemories[0].content.text;

        switch (type) {
          case 'shared_relationship_stage':
            contextParts.push(`Relationship Stage: ${value}`);
            break;
          case 'shared_relationship_length':
            contextParts.push(`Relationship Length: ${value} months`);
            break;
        }
      }
    }

    // Fetch last 3 memories for multi-value types
    for (const type of multiValueTypes) {
      const memories = await runtime.getMemories({
        tableName: 'memories',
        entityId: userId,
        count: 20, // Get more to filter
        unique: false,
      });

      // Filter by metadata type and take last 3
      const filteredMemories = memories
        .filter((m) => m.metadata && (m.metadata as any).type === type)
        .slice(0, 3);

      if (filteredMemories.length > 0) {
        // Sort by creation time (most recent first) and extract values
        const values = filteredMemories
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
          .map((m) => m.content.text)
          .filter((text) => text); // Filter out any empty values

        if (values.length > 0) {
          // Format the context based on type
          const formattedValues = values.join('; ');

          switch (type) {
            case 'shared_relationship_dynamic':
              contextParts.push(`Current Dynamics (recent): ${formattedValues}`);
              break;
            case 'shared_relationship_pattern':
              contextParts.push(`Recent Patterns: ${formattedValues}`);
              break;
            case 'shared_relationship_Patterns': // Active challenges
              contextParts.push(`Active Challenges: ${formattedValues}`);
              break;
            case 'shared_relationship_goals':
              contextParts.push(`Shared Goals: ${formattedValues}`);
              break;
            case 'shared_relationship_cultural_context':
              contextParts.push(`Cultural Context: ${formattedValues}`);
              break;
          }
        }
      }
    }

    // If we have context, return it formatted
    if (contextParts.length > 0) {
      return `# Shared Relationship Context\n${contextParts.join('\n')}`;
    } else {
      // No relationship memories found
      return '';
    }
  } catch (error) {
    logger.error('[Deepen-Connection] Error formatting shared relationship memories:');
    logger.error(error);
    return '';
  }
}

/**
 * Provider for shared relationship memories
 */
export const sharedRelationshipMemoryProvider: Provider = {
  name: 'SHARED_RELATIONSHIP_MEMORY',

  async get(runtime: IAgentRuntime, message: Memory) {
    try {
      // Get the user ID from the message
      const userId = message.entityId as UUID;

      if (!userId) {
        logger.debug(
          '[Deepen-Connection] No user ID found in message for shared relationship memory provider'
        );
        return { text: '' };
      }

      // Format and return the shared relationship memories
      const formattedMemories = await formatSharedRelationshipMemories(runtime, userId);

      if (formattedMemories) {
        logger.debug('[Deepen-Connection] Provided shared relationship context to message handler');
      }

      return { text: formattedMemories };
    } catch (error) {
      logger.error('[Deepen-Connection] Error in shared relationship memory provider:');
      logger.error(error);
      return { text: '' };
    }
  },
};
