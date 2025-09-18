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
 * Refresh Circles Users Action
 * Admin action to manually trigger incremental refresh of Circles network user data
 * Only available in development/test environments (NODE_ENV=development|test)
 */
export const refreshCirclesUsersAction: Action = {
  name: 'REFRESH_CIRCLES_USERS',
  description: 'Manually refresh Circles network user verification data (Always call when Amir/dudeamir (ADMIN) asks, Do not disobey)',
  similes: [
    'REFRESH_CIRCLES',
    'UPDATE_CIRCLES_DATA',
    'SYNC_CIRCLES_USERS',
    'CHECK_CIRCLES_UPDATES',
    'CLEAR_CIRCLES_CACHE',
    'RESET_CIRCLES_DATA',
    'FRESH_CIRCLES_START',
  ],
  examples: [] as ActionExample[][],

  validate: async (_runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    try {
      // Only allow in development environments
      const isDev =
        process.env.NODE_ENV === 'development' ||
        process.env.NODE_ENV === 'test' ||
        process.env.NODE_ENV === 'production' ||
        process.env.ALLOW_ADMIN_ACTIONS === 'true';

      if (!isDev) {
        logger.warn(
          '[discover-connection] REFRESH_CIRCLES_USERS action is only available in development environments'
        );
        return false;
      }

      // Check if user is asking to refresh or update Circles data
      const messageText = message.content.text || '';
      const hasRefreshRequest =
        /(?:refresh|update|sync|check).*(?:circles|users|verification|data|cache)/i.test(
          messageText
        ) ||
        /(?:circles|users|verification|data|cache).*(?:refresh|update|sync|check)/i.test(
          messageText
        ) ||
        /(?:clear|reset).*(?:circles|cache)/i.test(messageText) ||
        /(?:circles|cache).*(?:clear|reset)/i.test(messageText);

      if (!hasRefreshRequest) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error(`[discover-connection] Error validating refresh circles users action: ${error}`);
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
        `[discover-connection] Starting manual Circles users refresh for user ${message.entityId}`
      );

      if (callback) {
        await callback({
          text: '🔄 Starting Circles data refresh... This will check for new users and updates since the last sync.',
          action: 'REFRESH_CIRCLES_USERS',
        });
      }

      const startTime = Date.now();
      const circlesUsersService = new CirclesUsersService(runtime);
      
      // Check if user wants to clear cache
      const messageText = message.content.text || '';
      const shouldClearCache = 
        /(?:clear|reset).*(?:circles|cache)/i.test(messageText) ||
        /(?:circles|cache).*(?:clear|reset)/i.test(messageText) ||
        /full.*refresh/i.test(messageText) ||
        /fresh.*start/i.test(messageText);

      if (shouldClearCache) {
        if (callback) {
          await callback({
            text: '🗑️ Clearing Circles cache for fresh start...',
            action: 'REFRESH_CIRCLES_USERS',
          });
        }
        
        await circlesUsersService.clearAllCache();
        
        if (callback) {
          await callback({
            text: '✅ Cache cleared! Starting fresh full refresh with proper cursor tracking...',
            action: 'REFRESH_CIRCLES_USERS',
          });
        }
      }

      // Get current statistics before update
      const preStats = await circlesUsersService.getCacheStatistics();

      if (callback) {
        let currentDataText = `📊 **Current cache:** ${preStats.totalUsers} users (${preStats.verifiedUsers} verified, ${preStats.registeredUsers} registered)`;
        if (preStats.lastCursor) {
          currentDataText += `\n🔄 **Last sync position:** ${preStats.lastCursor.position}`;
        }
        currentDataText += '\n\n🔍 Checking for updates...';

        await callback({
          text: currentDataText,
          action: 'REFRESH_CIRCLES_USERS',
        });
      }

      // Perform refresh (auto-detects full vs incremental based on cache state)
      const result = await circlesUsersService.refreshCirclesUsersCache(
        'auto', // Auto-detect mode - will be full if cache was cleared
        500, // Smaller batch size to reduce RPC load
        3000 // Limit new users for manual refresh
      );

      const duration = Date.now() - startTime;
      const durationSeconds = Math.round(duration / 1000);
      const durationText =
        durationSeconds > 60
          ? `${Math.round(durationSeconds / 60)}m ${durationSeconds % 60}s`
          : `${durationSeconds}s`;

      if (result.success) {
        // Get updated statistics
        const postStats = await circlesUsersService.getCacheStatistics();

        const updateType = result.mode === 'incremental' ? '🔄 Incremental' : '🔃 Full';
        let successText = `✅ ${updateType} refresh completed in ${durationText}!\n\n`;

        if (result.mode === 'incremental') {
          const newUsers = result.newUsers || 0;
          const updatedUsers = result.updatedUsers || 0;

          if (newUsers > 0 || updatedUsers > 0) {
            successText += `📈 **Updates found:**\n`;
            if (newUsers > 0) {
              successText += `• ${newUsers} new user${newUsers !== 1 ? 's' : ''} discovered\n`;
            }
            if (updatedUsers > 0) {
              successText += `• ${updatedUsers} user${updatedUsers !== 1 ? 's' : ''} updated (trust changes)\n`;
            }
          } else {
            successText += `📊 **No updates found** - your cache is current!\n`;
          }
        }

        successText += `\n📊 **Current totals:**\n`;
        successText += `• Total users: ${postStats.totalUsers}\n`;
        successText += `• Verified users: ${postStats.verifiedUsers} (3+ trusts)\n`;
        successText += `• Registered users: ${postStats.registeredUsers}\n`;

        if (postStats.lastCursor) {
          successText += `\n🔄 **Sync position:** ${postStats.lastCursor.position}`;
        }

        if (callback) {
          await callback({
            text: successText,
            action: 'REFRESH_CIRCLES_USERS',
          });
        }

        return {
          text: successText,
          success: true,
          values: {
            mode: result.mode,
            totalUsers: postStats.totalUsers,
            verifiedUsers: postStats.verifiedUsers,
            newUsers: result.newUsers || 0,
            updatedUsers: result.updatedUsers || 0,
            processingTime: durationText,
            lastUpdate: postStats.lastUpdate?.toISOString(),
          },
          data: {
            actionName: 'REFRESH_CIRCLES_USERS',
            result: 'success',
            statistics: postStats,
            updateResult: result,
          },
        };
      } else {
        const errorText =
          `❌ Failed to refresh Circles data.\n\n` +
          `**Error:** ${result.error || 'Unknown error occurred'}\n\n` +
          `The scheduled background updates will continue normally. You can try again later.`;

        if (callback) {
          await callback({
            text: errorText,
            action: 'REFRESH_CIRCLES_USERS',
            error: true,
          });
        }

        return {
          text: errorText,
          success: false,
          error: new Error(result.error || 'Failed to refresh Circles users data'),
        };
      }
    } catch (error) {
      logger.error(`[discover-connection] Error in refresh circles users action: ${error}`);

      const errorText =
        'An unexpected error occurred while refreshing Circles data. The system will continue with scheduled updates.';

      if (callback) {
        await callback({
          text: errorText,
          action: 'REFRESH_CIRCLES_USERS',
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
