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

import { seedDiscoverConnectionTestData, cleanupDiscoverConnectionTestData } from '../utils/testDataSeeder.js';

/**
 * Development action to seed test data for Discover-Connection connection discovery
 * This action should only be used in development/testing environments
 */
export const seedTestDataAction: Action = {
  name: 'SEED_TEST_DATA',
  description:
    'Seeds the database with sample users for testing connection discovery functionality (Development only)',
  similes: ['POPULATE_TEST_DATA', 'CREATE_SAMPLE_USERS', 'SEED_DATABASE', 'ADD_TEST_USERS'],
  examples: [] as ActionExample[][],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    // Only allow in development environments
    const isDev =
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test' ||
      process.env.ALLOW_TEST_SEEDING === 'true';

    if (!isDev) {
      logger.warn('[discover-connection] SEED_TEST_DATA action is only available in development environments');
      return false;
    }

    // Check if message mentions seeding or test data
    const content = message.content.text?.toLowerCase() || '';
    return (
      content.includes('seed') ||
      content.includes('test data') ||
      content.includes('sample users') ||
      content.includes('populate')
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      logger.info(`[discover-connection] Processing seed test data request from user ${message.entityId}`);

      const content = message.content.text?.toLowerCase() || '';
      const isCleanup =
        content.includes('clean') || content.includes('clear') || content.includes('remove');

      if (isCleanup) {
        // Handle cleanup request
        await cleanupDiscoverConnectionTestData(runtime, message.roomId);

        const cleanupText =
          "I've initiated cleanup of test data. Please note that full cleanup may require manual database operations. Check the logs for more details.";

        if (callback) {
          await callback({
            text: cleanupText,
            action: 'SEED_TEST_DATA',
          });
        }

        return {
          text: cleanupText,
          success: true,
        };
      } else {
        // Handle seeding request
        const isForceReseed =
          content.includes('force') || content.includes('fresh') || content.includes('new');
        const seededMemories = await seedDiscoverConnectionTestData(runtime, {
          roomId: message.roomId,
          skipIfExists: !isForceReseed, // Skip if exists unless forcing reseed
          userCount: 8, // All test users
        });

        const successText = `🎉 Successfully seeded test data! Created ${seededMemories.length} sample users with persona contexts and embeddings.

Now you can test connection discovery with queries like:
• "Find me blockchain engineers for my datadao"
• "I need community builders with Web3 experience" 
• "Looking for technical co-founders"
• "Connect me with VCs interested in data infrastructure"

The vector search should now find relevant matches from the sample users!`;

        if (callback) {
          await callback({
            text: successText,
            action: 'SEED_TEST_DATA',
          });
        }

        return {
          text: successText,
          success: true,
          values: {
            seededCount: seededMemories.length,
            roomId: message.roomId,
          },
        };
      }
    } catch (error) {
      logger.error(`[discover-connection] Error in seed test data action: ${error}`);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorText = `❌ Failed to seed test data: ${errorMessage}

This might happen if:
• Database connection issues
• Missing environment variables
• Insufficient permissions
• Model API issues

Check the logs for more details.`;

      if (callback) {
        await callback({
          text: errorText,
          action: 'SEED_TEST_DATA',
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
