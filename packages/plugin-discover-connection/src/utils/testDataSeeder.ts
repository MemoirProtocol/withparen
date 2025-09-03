/**
 * Test Data Seeder for Discover-Connection Plugin
 *
 * This utility can be used to populate the database with sample users
 * for testing the connection discovery functionality.
 */

import { type IAgentRuntime, type Memory, ModelType, logger } from '@elizaos/core';
import { v4 as uuidv4 } from 'uuid';

interface TestUser {
  id: string;
  name: string;
  personaContext: string;
  connectionContext: string;
  tags: string[];
  walletAddress: string;
  trustTransactionHash: string;
  metriAccount: string;
  socialLinks: string[];
}

// Sample test users with diverse backgrounds for comprehensive testing
// These are existing group members who can be matched immediately
export const TEST_USERS: TestUser[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001', // Fixed UUID for consistency
    name: 'Alex Chen',
    personaContext: `Alex is a blockchain engineer with 8 years of experience in distributed systems and smart contract development. He has worked at major Web3 companies including Ethereum Foundation and Polygon. Alex is passionate about decentralized data solutions, DAOs, and has extensive experience in Solidity, Rust, and Go. He actively contributes to open-source projects and has helped launch 3 successful DeFi protocols. Alex is currently looking to collaborate on innovative data infrastructure projects and enjoys mentoring other developers transitioning into Web3. He has deep expertise in consensus algorithms, cryptographic protocols, and scalable blockchain architecture.`,
    connectionContext: `Alex is seeking technical co-founders and senior blockchain developers who share his passion for decentralized data infrastructure. He's particularly interested in connecting with entrepreneurs and product leaders who have experience scaling Web3 products, as well as researchers working on privacy-preserving technologies and zero-knowledge proofs. Alex values collaborators who understand both the technical complexities and business potential of blockchain technology, and who can help him build the next generation of decentralized data solutions.`,
    tags: ['blockchain', 'engineering', 'smart-contracts', 'web3', 'mentoring', 'defi'],
    walletAddress: '0x1234567890123456789012345678901234567890',
    trustTransactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    metriAccount: '0x4A6F78E1C2D3B4A5E6F78901234567890ABCDEF1',
    socialLinks: ['https://github.com/alexchen-dev', 'https://twitter.com/alexchen_web3'],
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002', // Fixed UUID for consistency
    name: 'Sarah Martinez',
    personaContext: `Sarah is a community builder and growth strategist who has helped scale Web3 communities from 0 to 100K+ members. She has experience working with major blockchain projects including Chainlink, Aave, and The Graph Protocol. Sarah specializes in tokenomics design, governance frameworks, and building engaged developer ecosystems. She has organized over 50 blockchain events, managed ambassador programs across 25+ countries, and has deep expertise in DAO governance structures. Sarah is passionate about decentralized technologies and connecting builders with the right resources and communities to succeed.`,
    connectionContext: `Sarah is looking to connect with technical founders, protocol developers, and community leaders who are building innovative Web3 infrastructure. She's especially interested in meeting developers working on DAO tooling, governance systems, and community-driven protocols. Sarah seeks collaborators who understand the importance of user experience and community engagement in driving adoption of decentralized technologies. She's also eager to connect with other growth professionals and marketing strategists who can help scale emerging blockchain projects.`,
    tags: ['community-building', 'web3', 'governance', 'events', 'growth', 'dao'],
    walletAddress: '0x2345678901234567890123456789012345678901',
    trustTransactionHash: '0xbcdef12345678901bcdef12345678901bcdef12345678901bcdef12345678901',
    metriAccount: '0x5B7F89E2D3F4C5B6F7890123456789012BCDEF23',
    socialLinks: ['https://twitter.com/sarahm_community', 'https://linkedin.com/in/sarahmartinez'],
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003', // Fixed UUID for consistency
    name: 'Marcus Johnson',
    personaContext: `Marcus is a seasoned product manager and tech entrepreneur with experience at both Fortune 500 companies and Web3 startups. He has launched 4 successful tech products and raised over $15M in venture funding. Marcus has deep expertise in data analytics, machine learning pipelines, and building data-driven products at scale. He's particularly interested in the intersection of AI and blockchain, and has been exploring decentralized data marketplaces. Marcus is actively looking for technical co-founders and engineering talent for his next venture in the decentralized data space.`,
    connectionContext: `Marcus is seeking experienced blockchain engineers, AI researchers, and data scientists who are interested in building the future of decentralized data infrastructure. He's particularly looking for technical co-founders with expertise in distributed systems, machine learning, and cryptographic protocols. Marcus values partners who have experience bringing complex technical products to market and understand the challenges of building in the Web3 space. He's also interested in connecting with other entrepreneurs, investors, and advisors who can provide strategic guidance for scaling data-focused blockchain ventures.`,
    tags: [
      'product-management',
      'entrepreneur',
      'data-analytics',
      'ai-blockchain',
      'co-founder',
      'funding',
    ],
    walletAddress: '0x3456789012345678901234567890123456789012',
    trustTransactionHash: '0xcdef123456789012cdef123456789012cdef123456789012cdef123456789012',
    metriAccount: '0x6C8F9AE3F4F5D6C7F890123456789013CDEF345',
    socialLinks: ['https://linkedin.com/in/marcusj-product', 'https://medium.com/@marcusjohnson'],
  },
];

/**
 * Seed test data for Discover-Connection connection discovery
 */
export async function seedDiscoverConnectionTestData(
  runtime: IAgentRuntime,
  options: {
    roomId?: string;
    worldId?: string;
    skipIfExists?: boolean;
    userCount?: number;
  } = {}
): Promise<Memory[]> {
  const {
    roomId = options.roomId, // Will be set per user below
    worldId = '00000000-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`, // All zeros UUID as requested
    skipIfExists = true,
    userCount = TEST_USERS.length,
  } = options;

  logger.info(`[discover-connection] Starting test data seeding with ${userCount} users...`);

  try {
    const createdMemories: Memory[] = [];
    const usersToCreate = TEST_USERS.slice(0, userCount);

    // Check if test data already exists (optional)
    if (skipIfExists) {
      try {
        // Check for existing test data specifically by looking for more records
        const existing = await runtime.getMemories({
          tableName: 'messages',
          roomId: roomId as `${string}-${string}-${string}-${string}-${string}`,
          count: userCount * 4, // Get enough to check for all record types (persona, connection, trust, verification)
        });

        // Filter for test data specifically (if metadata is available)
        const testDataMemories = existing.filter(
          (memory) => (memory.content?.metadata as any)?.isTestData === true
        );

        if (testDataMemories.length >= userCount) {
          logger.info(
            `[discover-connection] ${testDataMemories.length} test data records already exist in room ${roomId}, skipping seeding`
          );
          return testDataMemories.slice(0, userCount);
        } else if (testDataMemories.length > 0) {
          logger.info(
            `[discover-connection] Found ${testDataMemories.length} existing test records, but need ${userCount}. Creating additional records...`
          );
          // Continue with seeding to fill the gap
        } else {
          logger.debug(`[discover-connection] No test data found, proceeding with seeding`);
        }
      } catch (error) {
        logger.debug(
          `[discover-connection] Error checking existing data, proceeding with seeding: ${error}`
        );
      }
    }

    // Create test data for each user
    for (const user of usersToCreate) {
      logger.debug(`[discover-connection] Creating data for ${user.name}...`);

      try {
        // Use entityId as roomId for test users as requested
        const userRoomId = user.id as `${string}-${string}-${string}-${string}-${string}`; // Same as entityId for test users

        logger.debug(`[discover-connection] Creating persona context for ${user.name}...`);
        logger.debug(`[discover-connection]   - Entity ID: ${user.id}`);
        logger.debug(`[discover-connection]   - Room ID: ${userRoomId} (same as entityId)`);
        logger.debug(`[discover-connection]   - World ID: ${worldId} (all zeros)`);
        logger.debug(
          `[discover-connection]   - Context length: ${user.personaContext.length} characters`
        );

        // Create memory with proper UUID formats (using agent as entity to avoid permission issues)
        const memory = {
          id: uuidv4() as `${string}-${string}-${string}-${string}-${string}`,
          entityId: runtime.agentId, // Use agent ID to avoid entity permission issues
          agentId: runtime.agentId,
          roomId: userRoomId, // Use user.id as roomId for test profile separation
          worldId: worldId as `${string}-${string}-${string}-${string}-${string}`, // All zeros UUID
          content: {
            text: user.personaContext,
            type: 'persona_context',
            metadata: {
              name: user.name,
              tags: user.tags,
              isTestData: true,
              testUserId: user.id, // Store original test user ID for identification
            },
          },
          createdAt: Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000, // Random time in last 7 days
        };

        logger.debug(
          `[discover-connection] Creating memory with embedding using correct ElizaOS pattern...`
        );

        // Use the correct pattern: addEmbeddingToMemory FIRST (generates embedding), then createMemory (stores both)
        logger.debug(`[discover-connection] Generating embedding for persona context...`);
        const memoryWithEmbedding = await runtime.addEmbeddingToMemory(memory);

        if (!memoryWithEmbedding.embedding || memoryWithEmbedding.embedding.length === 0) {
          throw new Error(`Failed to generate embedding for ${user.name}`);
        }

        logger.debug(
          `[discover-connection] ✅ Generated embedding with length: ${memoryWithEmbedding.embedding.length}`
        );

        // Now create memory with embedding (this stores both memory and embedding in database)
        logger.debug(`[discover-connection] Storing memory with embedding in memories table...`);
        const memoryId = await runtime.createMemory(memoryWithEmbedding, 'messages');

        // Retrieve the final created memory
        const createdMemory = await runtime.getMemoryById(memoryId);

        if (!createdMemory) {
          throw new Error(`Failed to retrieve created memory with ID: ${memoryId}`);
        }

        logger.info(
          `[discover-connection] ✅ Successfully created persona context for ${user.name}:`
        );
        logger.debug(`[discover-connection]   - Memory ID: ${createdMemory.id}`);
        logger.debug(`[discover-connection]   - Entity ID: ${createdMemory.entityId}`);
        logger.debug(`[discover-connection]   - Room ID: ${createdMemory.roomId}`);
        logger.debug(`[discover-connection]   - Table: persona_contexts`);
        logger.debug(
          `[discover-connection]   - Has metadata: ${!!createdMemory.content?.metadata}`
        );
        logger.debug(
          `[discover-connection]   - Metadata name: ${(createdMemory.content?.metadata as any)?.name}`
        );
        logger.debug(`[discover-connection]   - Has embedding: ${!!createdMemory.embedding}`);
        logger.debug(
          `[discover-connection]   - Embedding length: ${createdMemory.embedding?.length || 'none'}`
        );

        createdMemories.push(createdMemory);

        // Create connection context for the user
        logger.debug(`[discover-connection] Creating connection context for ${user.name}...`);
        const connectionContextMemory = {
          id: uuidv4() as `${string}-${string}-${string}-${string}-${string}`,
          entityId: runtime.agentId, // Use agent ID to avoid entity permission issues
          agentId: runtime.agentId,
          roomId: userRoomId,
          worldId: worldId as `${string}-${string}-${string}-${string}-${string}`,
          content: {
            text: user.connectionContext,
            type: 'connection_context',
            metadata: {
              name: user.name,
              isTestData: true,
              testUserId: user.id, // Store original test user ID for identification
            },
          },
          createdAt: Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000,
        };

        const connectionMemoryWithEmbedding =
          await runtime.addEmbeddingToMemory(connectionContextMemory);
        const connectionMemoryId = await runtime.createMemory(
          connectionMemoryWithEmbedding,
          'messages'
        );
        logger.debug(
          `[discover-connection] ✅ Created connection context for ${user.name} with ID: ${connectionMemoryId}`
        );

        // Create user trust status record (marks them as group member)
        logger.debug(`[discover-connection] Creating user trust status for ${user.name}...`);
        const trustStatusMemory = {
          entityId: runtime.agentId, // Use agent ID to avoid entity permission issues
          agentId: runtime.agentId,
          roomId: userRoomId,
          content: {
            userId: user.id, // Keep original user ID in content for reference
            walletAddress: user.walletAddress,
            trustTransactionHash: user.trustTransactionHash,
            trustedAt: Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000, // Trusted in last 30 days
            circlesGroupCA: '0x742d35Cc6634C0532925a3b8D6C6c3b8c4EF1234', // Sample Circles group contract
            type: 'user_trust_status',
            text: `User ${user.id} trusted with wallet ${user.walletAddress} at ${new Date().toISOString()}`,
            metadata: {
              name: user.name,
              isTestData: true,
              testUserId: user.id, // Store original test user ID for identification
            },
          },
          createdAt: Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
        };

        const trustMemoryId = await runtime.createMemory(trustStatusMemory, 'messages');
        logger.debug(
          `[discover-connection] ✅ Created user trust status for ${user.name} with ID: ${trustMemoryId}`
        );

        // Create circles verification record (completed state)
        logger.debug(`[discover-connection] Creating circles verification for ${user.name}...`);
        const verificationMemory = {
          entityId: runtime.agentId, // Use agent ID to avoid entity permission issues
          agentId: runtime.agentId,
          roomId: userRoomId,
          content: {
            metriAccount: user.metriAccount,
            socialLinks: user.socialLinks,
            stage: 'complete',
            lastUpdated: Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
            type: 'circles_verification',
            text: `Verification stage: complete`,
            metadata: {
              name: user.name,
              isTestData: true,
              testUserId: user.id, // Store original test user ID for identification
            },
          },
          createdAt: Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
        };

        const verificationMemoryId = await runtime.createMemory(verificationMemory, 'messages');
        logger.debug(
          `[discover-connection] ✅ Created circles verification for ${user.name} with ID: ${verificationMemoryId}`
        );
      } catch (error) {
        logger.error(`[discover-connection] Failed to create data for ${user.name}: ${error}`);
        continue; // Continue with other users even if one fails
      }
    }

    logger.info(
      `[discover-connection] 🎉 Test data seeding completed! Created ${createdMemories.length} sample users`
    );

    if (createdMemories.length > 0) {
      logger.info(`[discover-connection] Test data stored in room: ${roomId}`);
      logger.info(`[discover-connection] Sample connection contexts to test with:`);
      logger.info(
        `[discover-connection]   • "Looking for blockchain engineers with smart contract experience"`
      );
      logger.info(
        `[discover-connection]   • "Need community builders to help grow a Web3 protocol"`
      );
      logger.info(
        `[discover-connection]   • "Seeking technical co-founders for a decentralized data project"`
      );
      logger.info(
        `[discover-connection]   • "Want to connect with VCs interested in infrastructure projects"`
      );
    }

    return createdMemories;
  } catch (error) {
    logger.error(`[discover-connection] Error seeding test data: ${error}`);
    throw error;
  }
}

/**
 * Clean up test data (useful for development)
 */
export async function cleanupDiscoverConnectionTestData(
  runtime: IAgentRuntime,
  roomId?: string
): Promise<void> {
  logger.info(
    `[discover-connection] Cleaning up test data${roomId ? ` in room ${roomId}` : ''}...`
  );

  try {
    // Note: This is a simplified cleanup. In a real implementation, you might want to
    // identify test data by metadata flags and remove them more selectively.
    logger.warn(
      `[discover-connection] Test data cleanup not fully implemented. Consider manual cleanup if needed.`
    );
    logger.info(`[discover-connection] To manually clean test data:`);
    logger.info(
      `[discover-connection]   1. Check memories table for entries with metadata.isTestData = true`
    );
    logger.info(`[discover-connection]   2. Remove corresponding embeddings and memories`);
  } catch (error) {
    logger.error(`[discover-connection] Error cleaning up test data: ${error}`);
    throw error;
  }
}

/**
 * Utility to get a specific test user by name or tag
 */
export function getTestUser(identifier: string) {
  return TEST_USERS.find(
    (user) =>
      user.name.toLowerCase().includes(identifier.toLowerCase()) ||
      user.tags.some((tag) => tag.toLowerCase().includes(identifier.toLowerCase()))
  );
}

/**
 * Get test users by tag
 */
export function getTestUsersByTag(tag: string) {
  return TEST_USERS.filter((user) =>
    user.tags.some((userTag) => userTag.toLowerCase().includes(tag.toLowerCase()))
  );
}
