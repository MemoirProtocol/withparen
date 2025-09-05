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
import { CirclesUsersService } from '../services/circlesUsers.js';

/**
 * Load Circles Users Action
 * Admin action to manually trigger loading and caching of Circles network user data
 * Only available in development/test environments (NODE_ENV=development|test)
 */
export const loadCirclesUsersAction: Action = {
  name: 'LOAD_CIRCLES_USERS',
  description:
    'Manually load and cache Circles network user verification data (Development only). CALL THIS ACTION WHEN A USER ASKS FOR IT.',
  similes: ['LOAD_CIRCLES', 'FETCH_CIRCLES_USERS', 'UPDATE_CIRCLES_CACHE', 'REFRESH_CIRCLES_DATA'],
  examples: [] as ActionExample[][],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    try {
      // Only allow in development environments
      const isDev =
        process.env.NODE_ENV === 'development' ||
        process.env.NODE_ENV === 'test' ||
        process.env.ALLOW_ADMIN_ACTIONS === 'true';

      if (!isDev) {
        logger.warn(
          '[discover-connection] LOAD_CIRCLES_USERS action is only available in development environments'
        );
        return false;
      }

      // Check if user is asking to load or refresh Circles data
      const messageText = message.content.text || '';
      const hasLoadRequest =
        /(?:load|fetch|update|refresh|cache).*(?:circles|users|verification)/i.test(messageText);

      if (!hasLoadRequest) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`[discover-connection] Error validating load circles users action: ${error}`);
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
        `[discover-connection] Starting manual Circles users load for user ${message.entityId}`
      );

      if (callback) {
        await callback({
          text: 'Starting to load Circles network user data... This may take several minutes.',
          action: 'LOAD_CIRCLES_USERS',
        });
      }

      const startTime = Date.now();
      const circlesUsersService = new CirclesUsersService(runtime);

      // Get current statistics before update
      const preStats = await circlesUsersService.getCacheStatistics();

      if (callback) {
        const currentDataText =
          preStats.totalUsers > 0
            ? `Current cache has ${preStats.totalUsers} users (${preStats.verifiedUsers} verified). Cache age: ${preStats.cacheAge}.`
            : 'No cached data found.';

        await callback({
          text: `${currentDataText}\n\nFetching latest data from Circles network...`,
          action: 'LOAD_CIRCLES_USERS',
        });
      }

      // Fetch and cache users with progress updates
      const result = await circlesUsersService.fetchAndCacheCirclesUsers(
        1000, // Batch size
        20000 // Max users for manual load (higher than automatic)
      );

      const duration = Date.now() - startTime;
      const durationMinutes = Math.round(duration / (1000 * 60));
      const durationSeconds = Math.round(duration / 1000);
      const durationText =
        durationMinutes > 0 ? `${durationMinutes} minutes` : `${durationSeconds} seconds`;

      if (result.success) {
        // Get updated statistics
        const postStats = await circlesUsersService.getCacheStatistics();

        const successText =
          `✅ Successfully loaded Circles users data!\n\n` +
          `📊 **Results:**\n` +
          `• Total users: ${postStats.totalUsers}\n` +
          `• Verified users (3+ trusts): ${postStats.verifiedUsers}\n` +
          `• Registered but unverified: ${postStats.registeredUsers}\n` +
          `• Processing time: ${durationText}\n` +
          `• Last updated: ${postStats.lastUpdate?.toISOString() || 'now'}\n\n` +
          `The cache will automatically refresh every 24 hours.`;

        if (callback) {
          await callback({
            text: successText,
            action: 'LOAD_CIRCLES_USERS',
          });
        }

        return {
          text: successText,
          success: true,
          values: {
            totalUsers: postStats.totalUsers,
            verifiedUsers: postStats.verifiedUsers,
            registeredUsers: postStats.registeredUsers,
            processingTime: durationText,
            lastUpdate: postStats.lastUpdate?.toISOString(),
          },
          data: {
            actionName: 'LOAD_CIRCLES_USERS',
            result: 'success',
            statistics: postStats,
          },
        };
      } else {
        const errorText =
          `❌ Failed to load Circles users data.\n\n` +
          `**Error:** ${result.error || 'Unknown error occurred'}\n\n` +
          `Please try again later or check the logs for more details.`;

        if (callback) {
          await callback({
            text: errorText,
            action: 'LOAD_CIRCLES_USERS',
            error: true,
          });
        }

        return {
          text: errorText,
          success: false,
          error: new Error(result.error || 'Failed to load Circles users data'),
        };
      }
    } catch (error) {
      logger.error(`[discover-connection] Error in load circles users action: ${error}`);

      const errorText =
        'An unexpected error occurred while loading Circles users data. Please try again later.';

      if (callback) {
        await callback({
          text: errorText,
          action: 'LOAD_CIRCLES_USERS',
          error: true,
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
