import type { Plugin } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { z } from 'zod';
import { OceanPublishingService } from './services/OceanPublishingService';
import { publishMemoryAction, listAssetsAction } from './actions';
import { memoryExtractionEvaluator } from './evaluators/memoryExtractor';
import { 
  oceanAssetsProvider, 
  oceanStatusProvider, 
  oceanSuggestionsProvider 
} from './providers';

const configSchema = z.object({
  // Ocean Node Configuration
  OCEAN_NODE_GATEWAY: z
    .string()
    .url()
    .optional()
    .default('http://localhost:8000/api/aquarius/assets/ddo'),
  OCEAN_NODE_URL: z
    .string()
    .url() 
    .optional()
    .default('http://localhost:8001'),

  // Network Configuration
  OPTIMISM_RPC_URL: z
    .string()
    .url()
    .optional()
    .default('https://sepolia.optimism.io'),
  OPTIMISM_CHAIN_ID: z
    .number()
    .optional()
    .default(11155420), // Optimism Sepolia for testing

  // Publishing Behavior
  OCEAN_AUTO_PUBLISH: z
    .boolean()
    .optional()
    .default(true),
  OCEAN_MIN_MEMORY_LENGTH: z
    .number()
    .min(10)
    .optional()
    .default(50),
  OCEAN_PUBLISH_INTERVAL: z
    .number()
    .min(60000) // Minimum 1 minute
    .optional()
    .default(300000), // 5 minutes

  // DataNFT Configuration
  OCEAN_DEFAULT_LICENSE: z
    .string()
    .optional()
    .default('CC-BY-4.0'),
  OCEAN_TAG_PREFIX: z
    .string()
    .optional()
    .default('eliza-memory'),
});

export const oceanPlugin: Plugin = {
  name: 'plugin-ocean',
  description: 'Ocean Protocol integration for ElizaOS - extracts memories from conversations and publishes them as DataNFTs using Safe smart accounts',
  
  config: {
    OCEAN_NODE_GATEWAY: process.env.OCEAN_NODE_GATEWAY,
    OCEAN_NODE_URL: process.env.OCEAN_NODE_URL,
    OPTIMISM_RPC_URL: process.env.OPTIMISM_RPC_URL,
    OPTIMISM_CHAIN_ID: process.env.OPTIMISM_CHAIN_ID ? parseInt(process.env.OPTIMISM_CHAIN_ID) : undefined,
    OCEAN_AUTO_PUBLISH: process.env.OCEAN_AUTO_PUBLISH === 'true',
    OCEAN_MIN_MEMORY_LENGTH: process.env.OCEAN_MIN_MEMORY_LENGTH ? parseInt(process.env.OCEAN_MIN_MEMORY_LENGTH) : undefined,
    OCEAN_PUBLISH_INTERVAL: process.env.OCEAN_PUBLISH_INTERVAL ? parseInt(process.env.OCEAN_PUBLISH_INTERVAL) : undefined,
    OCEAN_DEFAULT_LICENSE: process.env.OCEAN_DEFAULT_LICENSE,
    OCEAN_TAG_PREFIX: process.env.OCEAN_TAG_PREFIX,
  },

  async init(config: Record<string, unknown>) {
    logger.info('Initializing Ocean Protocol plugin');
    
    try {
      const validatedConfig = await configSchema.parseAsync(config);
      
      // Set environment variables for other components to use
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value !== undefined) {
          process.env[key] = String(value);
        }
      }
      
      logger.info(`Ocean Protocol plugin configuration validated:`);
      logger.info(`- Gateway: ${validatedConfig.OCEAN_NODE_GATEWAY}`);
      logger.info(`- Chain ID: ${validatedConfig.OPTIMISM_CHAIN_ID}`);
      logger.info(`- Auto-publish: ${validatedConfig.OCEAN_AUTO_PUBLISH}`);
      logger.info(`- Min memory length: ${validatedConfig.OCEAN_MIN_MEMORY_LENGTH} chars`);
      logger.info(`- Publish interval: ${validatedConfig.OCEAN_PUBLISH_INTERVAL}ms`);

      // Validate Ocean Node connectivity at startup
      try {
        const axios = (await import('axios')).default;
        const response = await axios.get(`${validatedConfig.OCEAN_NODE_URL}/api/v1/node/status`, {
          timeout: 5000,
        });
        
        if (response.status === 200) {
          logger.info('✅ Ocean Node connectivity verified');
        } else {
          logger.warn(`⚠️ Ocean Node responded with status ${response.status}`);
        }
      } catch (connectError) {
        logger.warn('⚠️ Could not verify Ocean Node connectivity:', connectError.message);
        logger.warn('Ocean Protocol features may not work properly. Please check your Ocean Node configuration.');
      }

    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid Ocean Protocol plugin configuration: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
        );
      }
      throw error;
    }
  },

  services: [OceanPublishingService],
  
  actions: [
    publishMemoryAction,
    listAssetsAction,
  ],
  
  evaluators: [
    memoryExtractionEvaluator,
  ],
  
  providers: [
    oceanAssetsProvider,
    oceanStatusProvider,
    oceanSuggestionsProvider,
  ],

  // No events needed - we rely on evaluators to trigger memory extraction and publishing
};

export default oceanPlugin;