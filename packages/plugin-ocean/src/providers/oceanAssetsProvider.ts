import {
  type IAgentRuntime,
  type Memory, 
  type Provider,
  type State,
  logger
} from '@elizaos/core';
import { OceanPublishingService } from '../services/OceanPublishingService';
import { 
  getDimensionDisplayName,
  shortenAddress,
  formatTimestamp
} from '../utils/oceanHelpers';

export const oceanAssetsProvider: Provider = {
  get: async (runtime: IAgentRuntime, message?: Memory, state?: State): Promise<string> => {
    try {
      // Get Ocean Publishing Service
      const oceanService = runtime.getService<OceanPublishingService>('ocean-publishing');
      
      if (!oceanService) {
        return 'Ocean Protocol integration not available.';
      }

      // Get user ID from message or state
      const userId = message?.entityId || state?.entityId;
      if (!userId) {
        return 'Ocean Protocol: User context not available.';
      }

      // Get user's asset statistics and recent publications
      const [stats, recentAssets] = await Promise.all([
        oceanService.getPublishingStats(userId),
        oceanService.getCachedAssets(userId).then(assets => assets.slice(0, 3)) // Get 3 most recent
      ]);

      if (stats.totalAssets === 0) {
        return 'Ocean Protocol: No DataNFTs published yet. Your conversation memories can be automatically extracted and published as valuable data assets.';
      }

      // Build context about user's Ocean assets
      let context = `Ocean Protocol Portfolio: ${stats.totalAssets} DataNFT${stats.totalAssets !== 1 ? 's' : ''} published`;
      
      // Add dimension breakdown
      const dimensionEntries = Object.entries(stats.dimensionCounts);
      if (dimensionEntries.length > 0) {
        context += '\n\nMemory Types Published:\n';
        dimensionEntries.forEach(([dimension, count]) => {
          const displayName = getDimensionDisplayName(dimension as any);
          context += `• ${displayName}: ${count}\n`;
        });
      }

      // Add recent publications
      if (recentAssets.length > 0) {
        context += '\nRecent DataNFTs:\n';
        recentAssets.forEach(asset => {
          const dimensionName = getDimensionDisplayName(asset.dimension);
          context += `• ${asset.metadata.name} (${dimensionName}) - ${formatTimestamp(asset.publishedAt)}\n`;
        });
      }

      // Add publishing stats
      if (stats.lastPublished) {
        const timeSinceLastPublish = Date.now() - stats.lastPublished;
        const daysSince = Math.floor(timeSinceLastPublish / (1000 * 60 * 60 * 24));
        
        if (daysSince === 0) {
          context += '\nLast published: Today';
        } else if (daysSince === 1) {
          context += '\nLast published: Yesterday';
        } else {
          context += `\nLast published: ${daysSince} days ago`;
        }
      }

      // Add auto-publishing status
      const autoPublish = process.env.OCEAN_AUTO_PUBLISH === 'true';
      context += `\nAuto-publishing: ${autoPublish ? 'Enabled' : 'Disabled'}`;

      return context;

    } catch (error) {
      logger.error('Error in Ocean assets provider:', error);
      return 'Ocean Protocol: Error retrieving asset information.';
    }
  },
};

/**
 * Provider that gives context about Ocean Protocol integration status
 */
export const oceanStatusProvider: Provider = {
  get: async (runtime: IAgentRuntime, message?: Memory, state?: State): Promise<string> => {
    try {
      const oceanService = runtime.getService<OceanPublishingService>('ocean-publishing');
      
      if (!oceanService) {
        return 'Ocean Protocol Status: Service not initialized';
      }

      // Check configuration
      const config = {
        autoPublish: process.env.OCEAN_AUTO_PUBLISH === 'true',
        gatewayUrl: process.env.OCEAN_NODE_GATEWAY || 'http://localhost:8000',
        chainId: process.env.OPTIMISM_CHAIN_ID || '10',
        minLength: process.env.OCEAN_MIN_MEMORY_LENGTH || '50',
        publishInterval: process.env.OCEAN_PUBLISH_INTERVAL || '300000'
      };

      let status = 'Ocean Protocol Status: Active\n';
      status += `Gateway: ${shortenUrl(config.gatewayUrl)}\n`;
      status += `Network: Optimism (Chain ID: ${config.chainId})\n`;
      status += `Auto-publish: ${config.autoPublish ? 'Enabled' : 'Disabled'}\n`;
      status += `Min memory length: ${config.minLength} chars\n`;
      
      if (config.autoPublish) {
        const intervalMinutes = Math.floor(parseInt(config.publishInterval) / 60000);
        status += `Publish interval: ${intervalMinutes} minutes`;
      }

      return status;

    } catch (error) {
      logger.error('Error in Ocean status provider:', error);
      return 'Ocean Protocol Status: Error checking status';
    }
  },
};

/**
 * Provider that suggests Ocean-related actions based on conversation context
 */
export const oceanSuggestionsProvider: Provider = {
  get: async (runtime: IAgentRuntime, message?: Memory, state?: State): Promise<string> => {
    try {
      const oceanService = runtime.getService<OceanPublishingService>('ocean-publishing');
      
      if (!oceanService) {
        return '';
      }

      const userId = message?.entityId || state?.entityId;
      if (!userId) {
        return '';
      }

      // Get current message count since last extraction
      const lastExtractionKey = `${message?.roomId}-ocean-memory-extraction-last-processed`;
      const lastMessageId = await runtime.getCache<string>(lastExtractionKey);
      
      const recentMessages = await runtime.getMemories({
        tableName: 'messages',
        roomId: message?.roomId,
        count: 10,
        unique: false,
      });

      let messagesSinceExtraction = recentMessages.length;
      
      if (lastMessageId) {
        const lastIndex = recentMessages.findIndex(msg => msg.id === lastMessageId);
        if (lastIndex !== -1) {
          messagesSinceExtraction = lastIndex;
        }
      }

      // Get user's current asset count
      const stats = await oceanService.getPublishingStats(userId);
      
      let suggestions = '';

      // Suggest based on conversation activity
      if (messagesSinceExtraction >= 3 && messagesSinceExtraction < 6) {
        suggestions += 'Ocean Protocol: Conversation contains potential memories for DataNFT extraction. ';
      }

      // Suggest based on asset count
      if (stats.totalAssets === 0) {
        suggestions += 'Consider enabling auto-publishing to monetize your conversation insights as DataNFTs. ';
      } else if (stats.totalAssets < 5) {
        suggestions += 'You\'re building a nice collection of memory DataNFTs! ';
      }

      // Suggest based on last publish time
      if (stats.lastPublished) {
        const timeSinceLastPublish = Date.now() - stats.lastPublished;
        const daysSince = Math.floor(timeSinceLastPublish / (1000 * 60 * 60 * 24));
        
        if (daysSince >= 7) {
          suggestions += 'It\'s been a while since your last DataNFT publication - your recent conversations might contain valuable new memories. ';
        }
      }

      // Add action suggestions
      if (suggestions) {
        const autoPublish = process.env.OCEAN_AUTO_PUBLISH === 'true';
        
        if (!autoPublish) {
          suggestions += 'You can ask me to "publish a memory" or "show my Ocean assets" anytime.';
        } else {
          suggestions += 'Auto-publishing is active, so valuable memories will be automatically published as DataNFTs.';
        }
      }

      return suggestions;

    } catch (error) {
      logger.error('Error in Ocean suggestions provider:', error);
      return '';
    }
  },
};

/**
 * Helper function to shorten URLs for display
 */
function shortenUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.hostname}${urlObj.pathname !== '/' ? urlObj.pathname : ''}`;
  } catch {
    return url.length > 30 ? url.substring(0, 30) + '...' : url;
  }
}