/**
 * Test Data Seeder for Discover-Connection Plugin
 *
 * This utility can be used to populate the database with sample users
 * for testing the connection discovery functionality.
 */

import { type IAgentRuntime, type Memory, ModelType, logger } from '@elizaos/core';
import { v4 as uuidv4 } from 'uuid';

// Sample test users with diverse backgrounds for comprehensive testing
export const TEST_USERS = [
  {
    id: uuidv4(),
    name: 'Alex Chen',
    personaContext: `Alex is a blockchain engineer with 8 years of experience in distributed systems and smart contract development. He has worked at major Web3 companies including Ethereum Foundation and Polygon. Alex is passionate about decentralized data solutions, DAOs, and has extensive experience in Solidity, Rust, and Go. He actively contributes to open-source projects and has helped launch 3 successful DeFi protocols. Alex is currently looking to collaborate on innovative data infrastructure projects and enjoys mentoring other developers transitioning into Web3. He has deep expertise in consensus algorithms, cryptographic protocols, and scalable blockchain architecture.`,
    tags: ['blockchain', 'engineering', 'smart-contracts', 'web3', 'mentoring', 'defi'],
  },
  {
    id: uuidv4(),
    name: 'Sarah Martinez',
    personaContext: `Sarah is a community builder and growth strategist who has helped scale Web3 communities from 0 to 100K+ members. She has experience working with major blockchain projects including Chainlink, Aave, and The Graph Protocol. Sarah specializes in tokenomics design, governance frameworks, and building engaged developer ecosystems. She has organized over 50 blockchain events, managed ambassador programs across 25+ countries, and has deep expertise in DAO governance structures. Sarah is passionate about decentralized technologies and connecting builders with the right resources and communities to succeed.`,
    tags: ['community-building', 'web3', 'governance', 'events', 'growth', 'dao'],
  },
  {
    id: uuidv4(),
    name: 'Marcus Johnson',
    personaContext: `Marcus is a seasoned product manager and tech entrepreneur with experience at both Fortune 500 companies and Web3 startups. He has launched 4 successful tech products and raised over $15M in venture funding. Marcus has deep expertise in data analytics, machine learning pipelines, and building data-driven products at scale. He's particularly interested in the intersection of AI and blockchain, and has been exploring decentralized data marketplaces. Marcus is actively looking for technical co-founders and engineering talent for his next venture in the decentralized data space.`,
    tags: [
      'product-management',
      'entrepreneur',
      'data-analytics',
      'ai-blockchain',
      'co-founder',
      'funding',
    ],
  },
  {
    id: uuidv4(),
    name: 'Dr. Emily Wang',
    personaContext: `Emily is a data scientist and researcher with a PhD in Computer Science from Stanford, specializing in distributed systems and privacy-preserving technologies. She has published 25+ papers on decentralized data systems, zero-knowledge proofs, and blockchain scalability. Emily has worked at Google Research and Microsoft Research before transitioning to Web3. She's passionate about building privacy-first data solutions and has expertise in cryptographic protocols, federated learning, and decentralized identity systems. Emily is looking for innovative projects where she can apply her research to real-world decentralized applications.`,
    tags: [
      'data-science',
      'research',
      'privacy',
      'zero-knowledge',
      'distributed-systems',
      'academia',
    ],
  },
  {
    id: uuidv4(),
    name: 'David Kim',
    personaContext: `David is a full-stack developer and DevRel engineer with 6 years of experience in blockchain development. He has built developer tools, APIs, and SDKs for major DeFi protocols. David is passionate about developer experience, documentation, and making Web3 accessible to traditional developers. He has extensive experience in TypeScript, Python, and Solidity, and has contributed to major open-source projects including Hardhat and OpenZeppelin. David is currently looking for opportunities to help early-stage protocols build their developer ecosystems and technical communities.`,
    tags: ['full-stack', 'devrel', 'developer-tools', 'apis', 'typescript', 'open-source'],
  },
  {
    id: uuidv4(),
    name: 'Lisa Thompson',
    personaContext: `Lisa is a venture capital associate at a top-tier Web3 fund, focusing on infrastructure and data-layer investments. She has evaluated over 200 blockchain startups and has deep expertise in tokenomics, protocol design, and market analysis. Lisa has an MBA from Wharton and previously worked in traditional VC before transitioning to crypto. She's particularly interested in decentralized data solutions, privacy tech, and developer infrastructure. Lisa actively mentors founders and connects promising projects with the right investors, partners, and technical talent.`,
    tags: ['venture-capital', 'investments', 'infrastructure', 'tokenomics', 'mentoring', 'mba'],
  },
  {
    id: uuidv4(),
    name: 'Roberto Silva',
    personaContext: `Roberto is a technical writer and content strategist specializing in Web3 and blockchain technologies. He has created technical documentation, whitepapers, and educational content for over 20 blockchain projects. Roberto has a background in computer science and is skilled at translating complex technical concepts into accessible content. He's passionate about Web3 education and has helped numerous projects build their thought leadership through high-quality content. Roberto is looking for innovative protocols to partner with on content strategy and developer education initiatives.`,
    tags: [
      'technical-writing',
      'content-strategy',
      'documentation',
      'education',
      'whitepapers',
      'thought-leadership',
    ],
  },
  {
    id: uuidv4(),
    name: 'Jennifer Park',
    personaContext: `Jennifer is a UX/UI designer with 7 years of experience designing Web3 applications and developer tools. She has worked with major DeFi protocols to create intuitive user interfaces and improve user adoption. Jennifer has expertise in user research, design systems, and accessibility in blockchain applications. She's passionate about making decentralized technologies more user-friendly and has led design for 3 successful product launches that achieved 100K+ users. Jennifer is interested in collaborating with early-stage protocols on product design and user experience strategy.`,
    tags: ['ux-ui', 'design', 'user-research', 'accessibility', 'product-design', 'user-adoption'],
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
    worldId = '00000000-0000-0000-0000-000000000000', // All zeros UUID as requested
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
          tableName: 'persona_contexts',
          roomId,
          count: userCount, // Get the number we want to create
        });

        // Filter for test data specifically (if metadata is available)
        const testDataMemories = existing.filter(
          (memory) => memory.content?.metadata?.isTestData === true
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
        logger.debug(`[discover-connection] Error checking existing data, proceeding with seeding: ${error}`);
      }
    }

    // Create test data for each user
    for (const user of usersToCreate) {
      logger.debug(`[discover-connection] Creating data for ${user.name}...`);

      try {
        // Use entityId as roomId for test users as requested
        const userRoomId = user.id; // Same as entityId for test users

        logger.debug(`[discover-connection] Creating persona context for ${user.name}...`);
        logger.debug(`[discover-connection]   - Entity ID: ${user.id}`);
        logger.debug(`[discover-connection]   - Room ID: ${userRoomId} (same as entityId)`);
        logger.debug(`[discover-connection]   - World ID: ${worldId} (all zeros)`);
        logger.debug(`[discover-connection]   - Context length: ${user.personaContext.length} characters`);

        // Create memory with proper UUID formats
        const memory = {
          id: uuidv4(),
          entityId: user.id,
          agentId: runtime.agentId,
          roomId: userRoomId, // Use entityId as roomId for test users
          worldId, // All zeros UUID
          content: {
            text: user.personaContext,
            type: 'persona_context',
            metadata: {
              name: user.name,
              tags: user.tags,
              isTestData: true,
            },
          },
          createdAt: Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000, // Random time in last 7 days
        };

        logger.debug(`[discover-connection] Creating memory with embedding using correct ElizaOS pattern...`);

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
        logger.debug(`[discover-connection] Storing memory with embedding in persona_contexts table...`);
        const memoryId = await runtime.createMemory(memoryWithEmbedding, 'persona_contexts', true);

        // Retrieve the final created memory
        const createdMemory = await runtime.getMemoryById(memoryId);

        if (!createdMemory) {
          throw new Error(`Failed to retrieve created memory with ID: ${memoryId}`);
        }

        logger.info(`[discover-connection] ✅ Successfully created persona context for ${user.name}:`);
        logger.debug(`[discover-connection]   - Memory ID: ${createdMemory.id}`);
        logger.debug(`[discover-connection]   - Entity ID: ${createdMemory.entityId}`);
        logger.debug(`[discover-connection]   - Room ID: ${createdMemory.roomId}`);
        logger.debug(`[discover-connection]   - Table: persona_contexts`);
        logger.debug(`[discover-connection]   - Has metadata: ${!!createdMemory.content?.metadata}`);
        logger.debug(
          `[discover-connection]   - Metadata name: ${(createdMemory.content?.metadata as any)?.name}`
        );
        logger.debug(`[discover-connection]   - Has embedding: ${!!createdMemory.embedding}`);
        logger.debug(`[discover-connection]   - Embedding length: ${createdMemory.embedding?.length || 'none'}`);

        createdMemories.push(createdMemory);
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
      logger.info(`[discover-connection]   • "Looking for blockchain engineers with smart contract experience"`);
      logger.info(`[discover-connection]   • "Need community builders to help grow a Web3 protocol"`);
      logger.info(`[discover-connection]   • "Seeking technical co-founders for a decentralized data project"`);
      logger.info(`[discover-connection]   • "Want to connect with VCs interested in infrastructure projects"`);
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
export async function cleanupDiscoverConnectionTestData(runtime: IAgentRuntime, roomId?: string): Promise<void> {
  logger.info(`[discover-connection] Cleaning up test data${roomId ? ` in room ${roomId}` : ''}...`);

  try {
    // Note: This is a simplified cleanup. In a real implementation, you might want to
    // identify test data by metadata flags and remove them more selectively.
    logger.warn(
      `[discover-connection] Test data cleanup not fully implemented. Consider manual cleanup if needed.`
    );
    logger.info(`[discover-connection] To manually clean test data:`);
    logger.info(
      `[discover-connection]   1. Check persona_contexts table for entries with metadata.isTestData = true`
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
