import {
  type Action,
  type ActionResult,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  logger,
} from '@elizaos/core';
import { OceanPublishingService } from '../services/OceanPublishingService';
import { 
  getDimensionDisplayName, 
  shortenAddress, 
  formatTimestamp,
} from '../utils/oceanHelpers';

export const listAssetsAction: Action = {
  name: 'LIST_OCEAN_ASSETS',
  similes: [
    'LIST_DATANFTS',
    'SHOW_ASSETS',
    'MY_OCEAN_ASSETS', 
    'VIEW_DATANFTS',
    'OCEAN_PORTFOLIO',
    'PUBLISHED_MEMORIES',
  ],
  description: 'List user\'s published DataNFTs and Ocean Protocol assets with statistics',
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    try {
      const text = message.content.text?.toLowerCase() || '';
      
      // Check if user is asking to see their assets
      const listKeywords = [
        'list', 'show', 'view', 'see my', 'my assets', 'my datanfts',
        'published', 'ocean assets', 'portfolio', 'what have i published',
        'my memories', 'datanft stats', 'ocean stats', 'show assets'
      ];
      
      const hasListIntent = listKeywords.some(keyword => text.includes(keyword));
      
      // Also check for terms related to assets/NFTs when asking questions
      const assetTerms = ['asset', 'nft', 'datanft'];
      const hasAssetTerm = assetTerms.some(term => text.includes(term)) && 
                          (text.includes('my') || text.includes('show') || text.includes('list'));
      
      // Check if Ocean service is available
      const oceanService = runtime.getService<OceanPublishingService>('ocean-publishing');
      const serviceAvailable = oceanService !== null;
      
      const result = (hasListIntent || hasAssetTerm) && serviceAvailable;
      
      logger.debug(`ListAssets action validation: text="${text.substring(0, 50)}...", hasListIntent=${hasListIntent}, hasAssetTerm=${hasAssetTerm}, serviceAvailable=${serviceAvailable}, result=${result}`);
      
      return result;
    } catch (error) {
      logger.error('Error validating list assets action:', error);
      return false;
    }
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: 'Show me my published DataNFTs'
        }
      },
      {
        user: '{{agent}}',
        content: {
          text: '📊 **Your Ocean Protocol Portfolio**\n\n**Published DataNFTs**: 3 assets\n**Dimensions Published**:\n- Goals & Ambitions: 2 assets\n- Life Experiences: 1 asset\n\n**Recent Publications**:\n🎯 Goals & Ambitions Memory (DID: did:op:abc...)\n📅 Published: 2024-01-15\n💰 NFT: 0x1234...5678\n\n💡 Life Experiences Memory (DID: did:op:def...)\n📅 Published: 2024-01-10\n💰 NFT: 0x8765...4321',
          action: 'LIST_OCEAN_ASSETS'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: {
          text: 'What assets have I published on Ocean Protocol?'
        }
      },
      {
        user: '{{agent}}',
        content: {
          text: '🌊 **Ocean Protocol Assets Overview**\n\nYou have **5 DataNFTs** published from your conversation memories!\n\nBreakdown by memory type:\n- Personality Characteristics: 2 assets\n- Goals & Ambitions: 2 assets \n- Daily Routines: 1 asset\n\nTotal estimated value: Based on memory quality scores\nMost recent: Goals & Ambitions Memory (yesterday)\n\nWould you like to see detailed information about any specific asset?',
          action: 'LIST_OCEAN_ASSETS'
        }
      }
    ]
  ],
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      logger.info(`Processing list assets request from user ${message.entityId}`);

      // Get Ocean Publishing Service
      const oceanService = runtime.getService<OceanPublishingService>('ocean-publishing');

      if (!oceanService) {
        await callback?.({
          text: 'Ocean Protocol service is not available. Please ensure the Ocean plugin is properly configured.',
          error: true,
        });

        return {
          success: false,
          error: 'Ocean Publishing Service not available'
        };
      }

      try {
        // Get user's cached assets
        const cachedAssets = await oceanService.getCachedAssets(message.entityId);
        
        // Get publishing statistics
        const stats = await oceanService.getPublishingStats(message.entityId);
        
        if (cachedAssets.length === 0) {
          await callback?.({
            text: '🌊 **Ocean Protocol Portfolio**\n\n' +
                  '📭 You haven\'t published any DataNFTs yet!\n\n' +
                  '💡 **Getting Started:**\n' +
                  '• Continue chatting with me to generate valuable memories\n' +
                  '• I automatically extract insights from our conversations\n' +
                  '• Enable auto-publishing with `OCEAN_AUTO_PUBLISH=true`\n' +
                  '• Or manually request publication of specific memories\n\n' +
                  '🚀 Your conversation data can become valuable DataNFTs for market research, AI training, and behavioral analysis!'
          });

          return {
            success: true,
            text: 'No assets published yet',
            data: { assetCount: 0 }
          };
        }

        // Build comprehensive response
        let response = '🌊 **Your Ocean Protocol Portfolio**\n\n';
        
        // Overview statistics
        response += `📊 **Overview:**\n`;
        response += `• **Total DataNFTs**: ${stats.totalAssets}\n`;
        response += `• **Estimated Value**: ${stats.totalValue}\n`;
        
        if (stats.lastPublished) {
          response += `• **Last Published**: ${formatTimestamp(stats.lastPublished)}\n`;
        }
        
        response += '\n📈 **Memory Dimensions Published:**\n';
        
        // Dimension breakdown
        for (const [dimension, count] of Object.entries(stats.dimensionCounts)) {
          const displayName = getDimensionDisplayName(dimension as any);
          response += `• ${displayName}: ${count} asset${count !== 1 ? 's' : ''}\n`;
        }

        response += '\n📋 **Recent Publications:**\n\n';

        // List recent assets (up to 5)
        const recentAssets = cachedAssets.slice(0, 5);
        
        for (const asset of recentAssets) {
          const dimensionIcon = getDimensionIcon(asset.dimension);
          const dimensionName = getDimensionDisplayName(asset.dimension);
          
          response += `${dimensionIcon} **${asset.metadata.name}**\n`;
          response += `   📝 ${asset.metadata.description.substring(0, 80)}${asset.metadata.description.length > 80 ? '...' : ''}\n`;
          response += `   🆔 DID: \`${asset.did.substring(0, 20)}...\`\n`;
          response += `   📄 NFT: \`${shortenAddress(asset.nftAddress)}\`\n`;
          response += `   📅 ${formatTimestamp(asset.publishedAt)}\n`;
          response += `   🏷️ Type: ${dimensionName}\n\n`;
        }

        if (cachedAssets.length > 5) {
          response += `... and ${cachedAssets.length - 5} more assets\n\n`;
        }

        response += '💡 **Next Steps:**\n';
        response += '• Continue conversations to generate more valuable memories\n';
        response += '• Ask me to "publish a specific memory" for manual control\n';
        response += '• Check Ocean marketplace for your asset performance\n';
        response += '• Share your DataNFT DIDs with potential buyers';

        await callback?.({ text: response });

        return {
          success: true,
          text: 'Assets listed successfully',
          data: {
            assetCount: stats.totalAssets,
            dimensions: stats.dimensionCounts,
            assets: cachedAssets.map(asset => ({
              did: asset.did,
              name: asset.metadata.name,
              dimension: asset.dimension,
              publishedAt: asset.publishedAt,
            }))
          }
        };

      } catch (serviceError) {
        logger.error('Error fetching assets from Ocean service:', serviceError);

        await callback?.({
          text: '❌ **Error Fetching Assets**\n\n' +
                'I encountered an issue retrieving your Ocean Protocol assets. This could be due to:\n\n' +
                '• Network connectivity issues\n' +
                '• Ocean Node service problems\n' +
                '• Temporary synchronization delays\n\n' +
                'Please try again in a moment, or check that your Ocean node is running properly.',
          error: true,
        });

        return {
          success: false,
          error: serviceError.message
        };
      }

    } catch (error) {
      logger.error('Error in list assets action:', error);

      await callback?.({
        text: 'I encountered an error while retrieving your assets. Please try again.',
        error: true,
      });

      return {
        success: false,
        error: error.message
      };
    }
  },
};

/**
 * Get emoji icon for memory dimension
 */
function getDimensionIcon(dimension: string): string {
  const icons = {
    demographic: '👤',
    characteristic: '🧠', 
    routine: '🔄',
    goal: '🎯',
    experience: '💡',
    persona_relationship: '🤝',
    emotional_state: '💭',
  };
  
  return icons[dimension as keyof typeof icons] || '📄';
}