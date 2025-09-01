#!/usr/bin/env node

/**
 * Test Data Seeder for Discover-Connection Plugin
 *
 * This script seeds the database with sample users and their persona contexts
 * to enable testing of the connection discovery functionality.
 *
 * Usage:
 *   bun run seed-test-data.js
 *   node seed-test-data.js
 */

import { v4 as uuidv4 } from 'uuid';

// Sample test users with diverse backgrounds that would be good matches for different scenarios
const testUsers = [
  {
    id: uuidv4(),
    name: 'Alex Chen',
    personaContext: `Alex is a blockchain engineer with 8 years of experience in distributed systems and smart contract development. He has worked at major Web3 companies including Ethereum Foundation and Polygon. Alex is passionate about decentralized data solutions, DAOs, and has extensive experience in Solidity, Rust, and Go. He actively contributes to open-source projects and has helped launch 3 successful DeFi protocols. Alex is currently looking to collaborate on innovative data infrastructure projects and enjoys mentoring other developers transitioning into Web3. He has deep expertise in consensus algorithms, cryptographic protocols, and scalable blockchain architecture.`,
  },
  {
    id: uuidv4(),
    name: 'Sarah Martinez',
    personaContext: `Sarah is a community builder and growth strategist who has helped scale Web3 communities from 0 to 100K+ members. She has experience working with major blockchain projects including Chainlink, Aave, and The Graph Protocol. Sarah specializes in tokenomics design, governance frameworks, and building engaged developer ecosystems. She has organized over 50 blockchain events, managed ambassador programs across 25+ countries, and has deep expertise in DAO governance structures. Sarah is passionate about decentralized technologies and connecting builders with the right resources and communities to succeed.`,
  },
  {
    id: uuidv4(),
    name: 'Marcus Johnson',
    personaContext: `Marcus is a seasoned product manager and tech entrepreneur with experience at both Fortune 500 companies and Web3 startups. He has launched 4 successful tech products and raised over $15M in venture funding. Marcus has deep expertise in data analytics, machine learning pipelines, and building data-driven products at scale. He's particularly interested in the intersection of AI and blockchain, and has been exploring decentralized data marketplaces. Marcus is actively looking for technical co-founders and engineering talent for his next venture in the decentralized data space.`,
  },
  {
    id: uuidv4(),
    name: 'Dr. Emily Wang',
    personaContext: `Emily is a data scientist and researcher with a PhD in Computer Science from Stanford, specializing in distributed systems and privacy-preserving technologies. She has published 25+ papers on decentralized data systems, zero-knowledge proofs, and blockchain scalability. Emily has worked at Google Research and Microsoft Research before transitioning to Web3. She's passionate about building privacy-first data solutions and has expertise in cryptographic protocols, federated learning, and decentralized identity systems. Emily is looking for innovative projects where she can apply her research to real-world decentralized applications.`,
  },
  {
    id: uuidv4(),
    name: 'David Kim',
    personaContext: `David is a full-stack developer and DevRel engineer with 6 years of experience in blockchain development. He has built developer tools, APIs, and SDKs for major DeFi protocols. David is passionate about developer experience, documentation, and making Web3 accessible to traditional developers. He has extensive experience in TypeScript, Python, and Solidity, and has contributed to major open-source projects including Hardhat and OpenZeppelin. David is currently looking for opportunities to help early-stage protocols build their developer ecosystems and technical communities.`,
  },
  {
    id: uuidv4(),
    name: 'Lisa Thompson',
    personaContext: `Lisa is a venture capital associate at a top-tier Web3 fund, focusing on infrastructure and data-layer investments. She has evaluated over 200 blockchain startups and has deep expertise in tokenomics, protocol design, and market analysis. Lisa has an MBA from Wharton and previously worked in traditional VC before transitioning to crypto. She's particularly interested in decentralized data solutions, privacy tech, and developer infrastructure. Lisa actively mentors founders and connects promising projects with the right investors, partners, and technical talent.`,
  },
  {
    id: uuidv4(),
    name: 'Roberto Silva',
    personaContext: `Roberto is a technical writer and content strategist specializing in Web3 and blockchain technologies. He has created technical documentation, whitepapers, and educational content for over 20 blockchain projects. Roberto has a background in computer science and is skilled at translating complex technical concepts into accessible content. He's passionate about Web3 education and has helped numerous projects build their thought leadership through high-quality content. Roberto is looking for innovative protocols to partner with on content strategy and developer education initiatives.`,
  },
  {
    id: uuidv4(),
    name: 'Jennifer Park',
    personaContext: `Jennifer is a UX/UI designer with 7 years of experience designing Web3 applications and developer tools. She has worked with major DeFi protocols to create intuitive user interfaces and improve user adoption. Jennifer has expertise in user research, design systems, and accessibility in blockchain applications. She's passionate about making decentralized technologies more user-friendly and has led design for 3 successful product launches that achieved 100K+ users. Jennifer is interested in collaborating with early-stage protocols on product design and user experience strategy.`,
  },
];

// Different room contexts to simulate various conversation scenarios
const testRooms = [
  {
    id: uuidv4(),
    name: 'Web3 Builders Chat',
    description: 'A community for Web3 builders and entrepreneurs',
  },
  {
    id: uuidv4(),
    name: 'DAO Governance Discussion',
    description: 'Discussing governance frameworks and DAO structures',
  },
  {
    id: uuidv4(),
    name: 'Blockchain Developers',
    description: 'Technical discussions for blockchain developers',
  },
];

/**
 * Seed the database with test data
 */
async function seedTestData(runtime) {
  console.log('🌱 Starting test data seeding...');

  try {
    const agentId = runtime.agentId;
    const createdMemories = [];

    // Create test data for each user
    for (let i = 0; i < testUsers.length; i++) {
      const user = testUsers[i];
      const room = testRooms[i % testRooms.length]; // Cycle through rooms

      console.log(`👤 Creating data for ${user.name}...`);

      // Generate embedding for the persona context
      console.log('  🧠 Generating embedding...');
      const embedding = await runtime.useModel('text-embedding', {
        text: user.personaContext,
      });

      // Create memory with embedding
      const memory = await runtime.addEmbeddingToMemory({
        entityId: user.id,
        agentId: agentId,
        content: {
          text: user.personaContext,
          type: 'persona_context',
          name: user.name,
        },
        roomId: room.id,
        worldId: `world-${room.id}`,
        createdAt: Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000, // Random time in last 7 days
      });

      // Store in persona_contexts table
      await runtime.createMemory(memory, 'persona_contexts', true);

      createdMemories.push({
        user: user.name,
        memoryId: memory.id,
        roomId: room.id,
      });

      console.log(`  ✅ Created memory for ${user.name} (ID: ${memory.id})`);
    }

    console.log('\n🎉 Test data seeding completed successfully!');
    console.log(`📊 Created ${createdMemories.length} persona contexts with embeddings`);
    console.log('\nCreated users:');
    createdMemories.forEach(({ user, memoryId, roomId }) => {
      console.log(
        `  • ${user} (Memory: ${memoryId.slice(0, 8)}..., Room: ${roomId.slice(0, 8)}...)`
      );
    });

    console.log('\n🔍 Now you can test connection discovery with these sample users!');
    console.log('\nSample connection contexts that should find good matches:');
    console.log('  • "Looking for blockchain engineers with smart contract experience"');
    console.log('  • "Need community builders to help grow a Web3 protocol"');
    console.log('  • "Seeking technical co-founders for a decentralized data project"');
    console.log('  • "Want to connect with VCs interested in infrastructure projects"');

    return createdMemories;
  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    throw error;
  }
}

/**
 * Clear existing test data (optional cleanup function)
 */
async function clearTestData(runtime) {
  console.log('🧹 Clearing existing test data...');

  try {
    // Note: In a real scenario, you might want to implement a way to identify and remove test data
    // For now, this is a placeholder - manual cleanup may be needed
    console.log('⚠️  Manual cleanup may be required for existing test data');
    console.log('   Consider clearing the persona_contexts table if needed');
  } catch (error) {
    console.error('❌ Error clearing test data:', error);
    throw error;
  }
}

// Export functions for use in other scripts or manual execution
export { seedTestData, clearTestData, testUsers, testRooms };

// If running directly, provide a helpful message
if (typeof window === 'undefined' && typeof process !== 'undefined') {
  console.log('📝 Discover-Connection Test Data Seeder');
  console.log('\nThis script needs to be run within the ElizaOS runtime context.');
  console.log('To use this seeder:');
  console.log('\n1. Import it in your Discover-Connection plugin or runtime setup:');
  console.log('   import { seedTestData } from "./scripts/seed-test-data.js";');
  console.log('\n2. Call it with your runtime instance:');
  console.log('   await seedTestData(runtime);');
  console.log('\n3. Or create a simple runner script that initializes the runtime first.');
}
