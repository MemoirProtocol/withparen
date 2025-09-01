#!/usr/bin/env node

/**
 * Runner script for seeding test data
 *
 * This script sets up a minimal runtime environment and runs the test data seeder.
 *
 * Usage:
 *   cd packages/plugin-discover-connection
 *   bun run scripts/run-seed.js
 */

import { seedTestData } from './seed-test-data.js';

// Create a mock runtime for seeding purposes
class MockRuntime {
  constructor() {
    this.agentId = '8277813d-80a0-080c-ae7f-ee9dd76d6d16'; // Use a consistent agent ID
    this.memories = new Map();
    this.embeddings = new Map();
  }

  async useModel(modelType, params) {
    if (modelType === 'text-embedding' || modelType === 'TEXT_EMBEDDING') {
      // Generate a mock embedding (in real usage, this would call the actual model)
      console.log(`    📐 Generating mock embedding for text: "${params.text.slice(0, 50)}..."`);

      // Create a realistic-looking mock embedding (768 dimensions)
      const embedding = Array.from({ length: 768 }, () => Math.random() - 0.5);
      return embedding;
    }

    throw new Error(`Mock runtime doesn't support model type: ${modelType}`);
  }

  async addEmbeddingToMemory(memoryData) {
    const memoryId = `memory-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const memory = {
      id: memoryId,
      ...memoryData,
    };

    this.memories.set(memoryId, memory);
    console.log(`    💾 Stored memory with embedding (ID: ${memoryId})`);
    return memory;
  }

  async createMemory(memory, tableName, unique = false) {
    const key = `${tableName}-${memory.id}`;
    this.embeddings.set(key, { memory, tableName, unique });
    console.log(`    📝 Stored in table: ${tableName} (Unique: ${unique})`);
    return memory;
  }
}

async function main() {
  console.log('🚀 Discover-Connection Test Data Seeder Runner');
  console.log('================================\n');

  try {
    // Create mock runtime
    console.log('⚙️  Setting up mock runtime...');
    const runtime = new MockRuntime();
    console.log(`🤖 Agent ID: ${runtime.agentId}\n`);

    // Run the seeder
    const results = await seedTestData(runtime);

    console.log('\n📋 Seeding Summary:');
    console.log('===================');
    console.log(`✅ Successfully created ${results.length} test users`);
    console.log(`💾 Mock memories stored: ${runtime.memories.size}`);
    console.log(`🗄️  Mock embeddings stored: ${runtime.embeddings.size}`);

    console.log('\n🔧 Next Steps:');
    console.log('==============');
    console.log('1. This was a mock run. To actually populate your database:');
    console.log('   - Import seedTestData in your actual Discover-Connection plugin initialization');
    console.log('   - Call it with your real runtime instance');
    console.log('   - Or modify this script to connect to your actual database');
    console.log('\n2. Example integration code:');
    console.log('   ```typescript');
    console.log('   import { seedTestData } from "./scripts/seed-test-data.js";');
    console.log('   ');
    console.log('   // In your plugin initialization or setup');
    console.log('   if (process.env.SEED_TEST_DATA === "true") {');
    console.log('     await seedTestData(runtime);');
    console.log('   }');
    console.log('   ```');

    console.log('\n3. Test the connection discovery with contexts like:');
    console.log('   • "I need blockchain engineers for my datadao protocol"');
    console.log('   • "Looking for community builders with Web3 experience"');
    console.log('   • "Want to connect with technical co-founders"');
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
