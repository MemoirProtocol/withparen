import { 
  logger, 
  parseKeyValueXml, 
  composePrompt,
  type Evaluator,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type State,
  type UUID,
} from '@elizaos/core';
import type { MemoryDimension, MemoryDimensionType } from '../types';
import { 
  validateMemoryForPublishing,
  calculateMemoryUniqueness,
  sanitizeMemoryContent,
  generateContentTags,
} from '../utils/oceanHelpers';
import { OceanPublishingService } from '../services/OceanPublishingService';

/**
 * Template for extracting memories using PEACOCK framework and publishing them as DataNFTs
 */
const memoryExtractionTemplate = `# Task: Extract Ocean-Publishable Memory Insights

You are an Ocean Protocol Memory Extractor. Your role is to:
1. Extract valuable memories from conversation using the PEACOCK framework
2. Assess their quality and uniqueness for DataNFT publication
3. Only extract memories that would be valuable as tradeable data assets

## PEACOCK Framework Dimensions:
- **demographic**: Static facts (age, gender, location, religion, environment) 
- **characteristic**: Intrinsic traits, communication/attachment styles, personality
- **routine**: Regular habits, behaviors, patterns of activity
- **goal**: Ambitions, future plans, objectives, aspirations
- **experience**: Past events, experiences, significant life moments
- **persona_relationship**: Social connections, interactions, relationship patterns
- **emotional_state**: Current feelings, mood, emotional patterns, pain points

## Quality Criteria for Publication:
- Content must be at least 50 characters and meaningful
- Should provide unique insights about the person
- Must not contain sensitive information (SSN, credit cards, private addresses)
- Should be generalizable or interesting to potential data buyers
- Confidence level should be 0.7 or higher

## Recent Conversation:
{{recentMessages}}

## Known Published Memories:
{{knownPublishedMemories}}

# Instructions:
1. Extract NEW memory insights that would be valuable as DataNFTs
2. Only include memories NOT already published (check against known published memories)
3. Focus on memories that could be useful for:
   - Market research and consumer insights
   - Behavioral pattern analysis
   - Demographic studies
   - Psychological research (anonymized)
   - AI training data for understanding human patterns

4. For each memory, provide:
   - Clear, marketable description
   - Evidence from conversation
   - Confidence score (0.0-1.0)
   - Dimension classification

Do NOT include any thinking, reasoning, or explanation.
Go directly to the XML response format.

Generate a response in the following format:
<response>
  <memory1>specific memory insight that would be valuable as a DataNFT</memory1>
  <dimension1>demographic|characteristic|routine|goal|experience|persona_relationship|emotional_state</dimension1>
  <evidence1>supporting quote or reference from conversation</evidence1>
  <confidence1>confidence score from 0.7 to 1.0</confidence1>
  <memory2>another valuable memory insight</memory2>
  <dimension2>demographic|characteristic|routine|goal|experience|persona_relationship|emotional_state</dimension2>
  <evidence2>supporting quote or reference from conversation</evidence2>
  <confidence2>confidence score from 0.7 to 1.0</confidence2>
</response>

IMPORTANT: Only include memories that:
- Would be valuable to data buyers
- Are unique and not already published
- Meet quality criteria for DataNFT publication
- Do not contain sensitive personal information
- Have sufficient detail and context

You can include up to 5 memories using memory1-5, dimension1-5, evidence1-5, confidence1-5 patterns.`;

/**
 * Store extracted memory and optionally publish as DataNFT
 */
async function processExtractedMemory(
  runtime: IAgentRuntime,
  agentId: UUID,
  userId: UUID,
  roomId: UUID,
  memoryText: string,
  dimension: MemoryDimensionType,
  evidence: string,
  confidence: number
): Promise<void> {
  const memory: MemoryDimension = {
    type: dimension,
    content: sanitizeMemoryContent(memoryText),
    evidence,
    timestamp: Date.now(),
    userId,
    roomId,
    confidence,
  };

  // Validate memory for publishing
  const validation = validateMemoryForPublishing(memory);
  if (!validation.isValid) {
    logger.debug(`Memory not suitable for publishing: ${validation.errors.join(', ')}`);
    return;
  }

  try {
    // Store the memory in ElizaOS memory system
    const memoryRecord = await runtime.addEmbeddingToMemory({
      entityId: userId,
      agentId,
      content: { text: memory.content },
      roomId,
      createdAt: memory.timestamp,
    });

    const tableName = `ocean_memory_${dimension}`;
    await runtime.createMemory(memoryRecord, tableName, true);

    // Check if auto-publishing is enabled
    const autoPublish = process.env.OCEAN_AUTO_PUBLISH === 'true';
    
    if (autoPublish) {
      // Get Ocean Publishing Service
      const oceanService = runtime.getService<OceanPublishingService>('ocean-publishing');
      
      if (oceanService) {
        // Check if already published
        const alreadyPublished = await oceanService.isMemoryPublished(memory);
        
        if (!alreadyPublished) {
          // Check rate limiting
          const lastPublishKey = `ocean-last-publish-${userId}`;
          const lastPublishTime = await runtime.getCache<number>(lastPublishKey) || 0;
          const publishInterval = parseInt(process.env.OCEAN_PUBLISH_INTERVAL || '300000'); // 5 minutes
          
          if (Date.now() - lastPublishTime >= publishInterval) {
            try {
              const publishedAsset = await oceanService.publishMemoryAsDataNFT(memory);
              logger.info(`Auto-published memory as DataNFT: ${publishedAsset.did}`);
              
              // Update last publish time
              await runtime.setCache(lastPublishKey, Date.now());
            } catch (publishError) {
              logger.error(`Failed to auto-publish memory: ${publishError}`);
            }
          } else {
            logger.debug(`Rate limit: waiting ${publishInterval - (Date.now() - lastPublishTime)}ms for next publish`);
          }
        } else {
          logger.debug('Memory already published, skipping');
        }
      } else {
        logger.warn('Ocean Publishing Service not available for auto-publishing');
      }
    }

  } catch (error) {
    logger.error(`Error processing extracted memory: ${error}`);
  }
}

/**
 * Main evaluator handler
 */
async function handler(runtime: IAgentRuntime, message: Memory, state?: State) {
  const { agentId, roomId, entityId } = message;

  if (!agentId || !roomId) {
    logger.warn(`Missing agentId or roomId in message: ${JSON.stringify(message)}`);
    return;
  }

  // Get the user ID
  const userId = entityId !== agentId ? entityId : roomId;

  // Get recent messages for context
  const recentMessages = await runtime.getMemories({
    tableName: 'messages',
    roomId,
    count: 10,
    unique: false,
  });

  // Get existing published memories to prevent duplicates
  const oceanService = runtime.getService<OceanPublishingService>('ocean-publishing');
  let knownPublishedMemories = '';
  
  if (oceanService) {
    try {
      const publishedAssets = await oceanService.getCachedAssets(userId);
      knownPublishedMemories = publishedAssets
        .map(asset => `${asset.metadata.name}: ${asset.metadata.description}`)
        .join('\n');
    } catch (error) {
      logger.warn(`Failed to get published memories: ${error}`);
    }
  }

  if (!knownPublishedMemories) {
    knownPublishedMemories = 'No memories published yet.';
  }

  const prompt = composePrompt({
    state: {
      ...(state?.values || {}),
      recentMessages: formatMessages(recentMessages),
      knownPublishedMemories,
    },
    template: runtime.character.templates?.memoryExtractionTemplate || memoryExtractionTemplate,
  });

  try {
    const response = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
    });

    if (!response) {
      logger.warn('Memory extraction failed - empty response');
      return;
    }

    // Parse XML response
    const extraction = parseKeyValueXml(response);

    if (!extraction) {
      logger.warn(`Memory extraction failed - failed to parse XML: ${response}`);
      return;
    }

    // Process extracted memories (up to 5)
    const processedMemories: string[] = [];
    
    for (let i = 1; i <= 5; i++) {
      const memory = extraction[`memory${i}`];
      const dimension = extraction[`dimension${i}`] as MemoryDimensionType;
      const evidence = extraction[`evidence${i}`];
      const confidence = parseFloat(extraction[`confidence${i}`] || '0.0');

      if (memory && dimension && evidence && confidence >= 0.7) {
        // Check for duplicates in this extraction batch
        if (processedMemories.some(existing => 
          existing.toLowerCase().includes(memory.toLowerCase().substring(0, 50))
        )) {
          logger.debug(`Skipping duplicate memory in batch: ${memory.substring(0, 50)}...`);
          continue;
        }

        try {
          await processExtractedMemory(
            runtime,
            agentId,
            userId,
            roomId,
            memory,
            dimension,
            evidence,
            confidence
          );
          processedMemories.push(memory);
        } catch (error) {
          logger.error(`Error processing memory ${i}: ${error}`);
        }
      }
    }

    // Update cache with last processed message and timestamp
    const cacheKey = `${message.roomId}-ocean-memory-extraction-last-processed`;
    await runtime.setCache<string>(cacheKey, message?.id || '');
    await runtime.setCache<number>(`${cacheKey}-timestamp`, Date.now());

    logger.info(`Ocean memory extraction processed: ${processedMemories.length} memories extracted`);

  } catch (error) {
    logger.error(`Error in Ocean memory extraction handler: ${error}`);
    return;
  }
}

export const memoryExtractionEvaluator: Evaluator = {
  name: 'OCEAN_MEMORY_EXTRACTION',
  similes: [
    'OCEAN_MEMORY_EXTRACT', 
    'DATANFT_EXTRACT', 
    'MEMORY_PUBLISHER', 
    'OCEAN_INSIGHTS',
    'DATA_MONETIZATION'
  ],
  validate: async (runtime: IAgentRuntime, message: Memory): Promise<boolean> => {
    try {
      // Check if Ocean Publishing Service is available
      const oceanService = runtime.getService<OceanPublishingService>('ocean-publishing');
      if (!oceanService) {
        logger.debug('Ocean Publishing Service not available, skipping memory extraction');
        return false;
      }

      // Get cache key for this room
      const cacheKey = `${message.roomId}-ocean-memory-extraction-last-processed`;
      const lastMessageId = await runtime.getCache<string>(cacheKey);
      
      // Get recent messages to analyze
      const recentMessages = await runtime.getMemories({
        tableName: 'messages',
        roomId: message.roomId,
        count: 15,
        unique: false,
      });

      // Count messages since last extraction
      let messagesSinceExtraction = recentMessages.length;
      
      if (lastMessageId) {
        const lastIndex = recentMessages.findIndex((msg) => msg.id === lastMessageId);
        if (lastIndex !== -1) {
          // Count only messages after the last processed one
          messagesSinceExtraction = lastIndex;
        }
      }

      // Check for substantial content in recent messages
      const hasSubstantialContent = recentMessages.slice(0, messagesSinceExtraction).some(msg => 
        msg.content.text && 
        msg.content.text.trim().length >= 50 && // Lower threshold
        msg.entityId !== runtime.agentId // Exclude agent messages
      );

      // Trigger extraction every 2-3 messages (lower threshold for more frequent extraction)
      const extractionInterval = 2;
      const shouldExtract = messagesSinceExtraction >= extractionInterval && hasSubstantialContent;

      // Also trigger if it's been a while since last extraction
      const timeSinceLastExtraction = Date.now() - (await runtime.getCache<number>(`${cacheKey}-timestamp`) || 0);
      const timeThreshold = 5 * 60 * 1000; // 5 minutes
      const shouldExtractByTime = timeSinceLastExtraction > timeThreshold && hasSubstantialContent;

      const result = shouldExtract || shouldExtractByTime;
      
      logger.debug(
        `Ocean memory extraction validation: ${messagesSinceExtraction} messages since last extraction, ` +
        `substantial content: ${hasSubstantialContent}, time since last: ${Math.round(timeSinceLastExtraction/1000)}s, should extract: ${result}`
      );
      
      return result;
    } catch (error) {
      logger.error(`Error in Ocean memory extraction validation: ${error}`);
      return false;
    }
  },
  description:
    'Extracts valuable memories from conversations using PEACOCK framework and publishes them as DataNFTs on Ocean Protocol.',
  handler,
  examples: [
    {
      prompt: `Recent conversation about user's career goals and startup experience:`,
      messages: [
        {
          name: 'User',
          content: {
            text: "I've been working in fintech for 5 years but I'm really passionate about sustainable agriculture. I want to start my own vertical farming startup.",
          },
        },
        {
          name: 'Agent',
          content: {
            text: 'That\'s an exciting transition! What specific aspects of vertical farming interest you most?',
          },
        },
        {
          name: 'User',
          content: {
            text: "I love the efficiency - using 95% less water and growing food locally. I actually built a small hydroponic system in my garage last year.",
          },
        },
      ],
      outcome: `<response>
  <memory1>User has 5 years of fintech industry experience and is passionate about transitioning to sustainable agriculture entrepreneurship</memory1>
  <dimension1>goal</dimension1>
  <evidence1>"I've been working in fintech for 5 years but I'm really passionate about sustainable agriculture. I want to start my own vertical farming startup."</evidence1>
  <confidence1>0.9</confidence1>
  <memory2>User has hands-on experience with hydroponic systems and built their own small system in their garage</memory2>
  <dimension2>experience</dimension2>
  <evidence2>"I actually built a small hydroponic system in my garage last year."</evidence2>
  <confidence2>0.85</confidence2>
  <memory3>User values water efficiency and local food production as key motivations for vertical farming</memory3>
  <dimension3>characteristic</dimension3>
  <evidence3>"I love the efficiency - using 95% less water and growing food locally."</evidence3>
  <confidence3>0.8</confidence3>
</response>`,
    },
  ],
};

// Helper function to format messages for context
function formatMessages(messages: Memory[]): string {
  return messages
    .reverse()
    .map((msg: Memory) => {
      const sender = msg.entityId === msg.agentId ? 'Agent' : 'User';
      return `${sender}: ${msg.content.text}`;
    })
    .join('\n');
}