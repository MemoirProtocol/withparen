import {
  type Action,
  type ActionResult,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  logger,
  composePrompt,
  ModelType,
  parseKeyValueXml,
} from '@elizaos/core';
import type { MemoryDimension, MemoryDimensionType } from '../types';
import { OceanPublishingService } from '../services/OceanPublishingService';
import { 
  validateMemoryForPublishing, 
  sanitizeMemoryContent, 
  getDimensionDisplayName, 
  estimateMemoryValue,
  shortenAddress,
} from '../utils/oceanHelpers';

const publishMemoryTemplate = `# Task: Publish Memory as DataNFT

You are helping a user publish their extracted memory as a DataNFT on Ocean Protocol.

## Current Context:
{{recentMessages}}

## User Request:
The user wants to publish a memory as a DataNFT. 

## Available Memory Dimensions:
- demographic: Personal Demographics
- characteristic: Personality Characteristics
- routine: Daily Routines & Habits  
- goal: Goals & Ambitions
- experience: Life Experiences
- persona_relationship: Relationships & Social Connections
- emotional_state: Emotional States & Feelings

# Instructions:
1. If the user specified what memory to publish, extract and format it
2. If no specific memory was provided, ask them to clarify what they want to publish
3. Validate the memory content meets publishing requirements
4. Provide feedback on the memory's potential value as a DataNFT

Generate a response in this format:
<response>
  <action>publish|clarify|validate</action>
  <memory>memory content to publish (if action is publish)</memory>
  <dimension>memory dimension type (if action is publish)</dimension>
  <confidence>confidence score 0.7-1.0 (if action is publish)</confidence>
  <text>response to user</text>
</response>

IMPORTANT: Only proceed with publishing if:
- Memory content is clear and substantial (50+ characters)
- Appropriate dimension is identified
- Content doesn't contain sensitive information
- User explicitly requested publication`;

export const publishMemoryAction: Action = {
  name: 'PUBLISH_MEMORY',
  similes: [
    'PUBLISH_MEMORY_DATANFT',
    'CREATE_DATANFT', 
    'PUBLISH_TO_OCEAN',
    'MONETIZE_MEMORY',
    'OCEAN_PUBLISH'
  ],
  description: 'Manually publish a specific memory or conversation insight as a DataNFT on Ocean Protocol',
  validate: async (runtime: IAgentRuntime, message: Memory, state?: State): Promise<boolean> => {
    try {
      const text = message.content.text?.toLowerCase() || '';
      
      // Check if user is requesting to publish something
      const publishKeywords = [
        'publish', 'create datanft', 'monetize', 'ocean protocol', 
        'make money from', 'sell data', 'publish memory', 'create nft',
        'publish my', 'turn into nft', 'make nft', 'data asset'
      ];
      
      const hasPublishIntent = publishKeywords.some(keyword => text.includes(keyword));
      
      // Check if Ocean service is available
      const oceanService = runtime.getService<OceanPublishingService>('ocean-publishing');
      const serviceAvailable = oceanService !== null;
      
      const result = hasPublishIntent && serviceAvailable;
      
      logger.debug(`PublishMemory action validation: text="${text.substring(0, 50)}...", hasIntent=${hasPublishIntent}, serviceAvailable=${serviceAvailable}, result=${result}`);
      
      return result;
    } catch (error) {
      logger.error('Error validating publish memory action:', error);
      return false;
    }
  },
  examples: [
    [
      {
        user: '{{user1}}',
        content: {
          text: 'I want to publish my career goals as a DataNFT to monetize my professional insights'
        }
      },
      {
        user: '{{agent}}',
        content: {
          text: 'I can help you publish your career goals as a DataNFT on Ocean Protocol! From our conversation, I can extract your goal about transitioning from fintech to sustainable agriculture entrepreneurship. This would be valuable data for market researchers studying career transitions. Would you like me to proceed with publishing this insight?',
          action: 'PUBLISH_MEMORY'
        }
      }
    ],
    [
      {
        user: '{{user1}}',
        content: {
          text: 'How can I create a DataNFT from my conversation data?'
        }
      },
      {
        user: '{{agent}}',
        content: {
          text: 'I can help you create DataNFTs from your conversation insights! I extract valuable memories from our conversations using the PEACOCK framework (demographics, characteristics, routines, goals, experiences, relationships, emotions) and publish them on Ocean Protocol. What specific insights from our conversation would you like to monetize as a DataNFT?',
          action: 'PUBLISH_MEMORY'
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
      logger.info(`Processing publish memory request from user ${message.entityId}`);
      
      // Get Ocean Publishing Service
      const oceanService = runtime.getService<OceanPublishingService>('ocean-publishing');
      
      if (!oceanService) {
        await callback?.({
          text: 'Ocean Protocol publishing service is not available. Please ensure the Ocean plugin is properly configured.',
          error: true,
        });
        
        return {
          success: false,
          error: 'Ocean Publishing Service not available'
        };
      }

      // Get recent messages for context
      const recentMessages = await runtime.getMemories({
        tableName: 'messages',
        roomId: message.roomId,
        count: 5,
        unique: false,
      });

      // Compose prompt to understand user's intent
      const prompt = composePrompt({
        state: {
          ...(state?.values || {}),
          recentMessages: formatMessages(recentMessages),
        },
        template: publishMemoryTemplate,
      });

      const response = await runtime.useModel(ModelType.TEXT_SMALL, { prompt });
      const parsed = parseKeyValueXml(response);

      if (!parsed) {
        await callback?.({
          text: 'I had trouble understanding your publish request. Could you please specify what memory or insight from our conversation you\'d like to publish as a DataNFT?',
          error: true,
        });
        
        return {
          success: false,
          error: 'Failed to parse publishing intent'
        };
      }

      const action = parsed.action;
      const text = parsed.text || 'I can help you publish memories as DataNFTs on Ocean Protocol.';

      if (action === 'clarify') {
        await callback?.({ text });
        return { success: true, text };
      }

      if (action === 'validate') {
        await callback?.({ text });
        return { success: true, text };
      }

      if (action === 'publish' && parsed.memory && parsed.dimension && parsed.confidence) {
        const memoryContent = parsed.memory;
        const dimension = parsed.dimension as MemoryDimensionType;
        const confidence = parseFloat(parsed.confidence);

        // Create memory object
        const memory: MemoryDimension = {
          type: dimension,
          content: sanitizeMemoryContent(memoryContent),
          evidence: `User requested publication: "${message.content.text}"`,
          timestamp: Date.now(),
          userId: message.entityId,
          roomId: message.roomId,
          confidence,
        };

        // Validate memory
        const validation = validateMemoryForPublishing(memory);
        
        if (!validation.isValid) {
          await callback?.({
            text: `I cannot publish this memory due to validation issues:\n${validation.errors.join('\n')}`,
            error: true,
          });
          
          return {
            success: false,
            error: `Validation failed: ${validation.errors.join(', ')}`
          };
        }

        try {
          // Estimate publishing cost
          const costEstimate = await oceanService.estimatePublishingCost();
          
          // Estimate memory value
          const valueEstimate = estimateMemoryValue(memory);

          await callback?.({
            text: `🔄 Publishing your ${getDimensionDisplayName(dimension)} memory as a DataNFT...\n\n` +
                  `📊 **Memory Quality Score**: ${valueEstimate.score.toFixed(2)}/1.0\n` +
                  `💰 **Estimated Gas Cost**: ${costEstimate.formatted}\n` +
                  `🏷️ **Memory Type**: ${getDimensionDisplayName(dimension)}\n\n` +
                  `Publishing to Ocean Protocol...`
          });

          // Publish the memory
          const publishedAsset = await oceanService.publishMemoryAsDataNFT(memory);

          await callback?.({
            text: `✅ **DataNFT Published Successfully!**\n\n` +
                  `🆔 **Asset DID**: \`${publishedAsset.did}\`\n` +
                  `📄 **NFT Address**: \`${shortenAddress(publishedAsset.nftAddress)}\`\n` +
                  `🪙 **Datatoken**: \`${shortenAddress(publishedAsset.datatokenAddress)}\`\n` +
                  `⛓️ **Transaction**: \`${shortenAddress(publishedAsset.txHash)}\`\n\n` +
                  `🎉 Your ${getDimensionDisplayName(dimension)} memory is now a tradeable DataNFT on Ocean Protocol! ` +
                  `Data buyers can discover and purchase access to this insight for market research, AI training, or analysis.`
          });

          return {
            success: true,
            text: 'Memory published as DataNFT successfully',
            data: {
              did: publishedAsset.did,
              nftAddress: publishedAsset.nftAddress,
              txHash: publishedAsset.txHash,
            }
          };

        } catch (publishError) {
          logger.error('Failed to publish memory as DataNFT:', publishError);
          
          await callback?.({
            text: `❌ Failed to publish DataNFT: ${publishError.message}\n\n` +
                  `This could be due to network issues, insufficient gas, or Ocean Node connectivity problems. ` +
                  `Please try again later or check your wallet balance.`,
            error: true,
          });

          return {
            success: false,
            error: publishError.message
          };
        }
      }

      // Default response
      await callback?.({ text });
      return { success: true, text };

    } catch (error) {
      logger.error('Error in publish memory action:', error);
      
      await callback?.({
        text: 'I encountered an error while processing your publish request. Please try again.',
        error: true,
      });

      return {
        success: false,
        error: error.message
      };
    }
  },
};

// Helper function to format messages
function formatMessages(messages: Memory[]): string {
  return messages
    .reverse()
    .map((msg: Memory) => {
      const sender = msg.entityId === msg.agentId ? 'Agent' : 'User';
      return `${sender}: ${msg.content.text}`;
    })
    .join('\n');
}