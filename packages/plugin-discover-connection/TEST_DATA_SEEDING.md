# Discover-Connection Test Data Seeding

This guide explains how to populate your Discover-Connection plugin database with sample users for testing the connection discovery functionality.

## Overview

Discover-Connection's connection discovery relies on having user persona contexts stored in the database to find meaningful matches. For testing purposes, we've created a comprehensive test data seeder that adds 8 diverse sample users with rich persona contexts.

## Sample Users

The seeder creates the following types of users:

1. **Alex Chen** - Blockchain Engineer (Smart contracts, DeFi, distributed systems)
2. **Sarah Martinez** - Community Builder (Web3 growth, DAO governance, events)
3. **Marcus Johnson** - Product Manager/Entrepreneur (Data analytics, AI+blockchain)
4. **Dr. Emily Wang** - Data Scientist/Researcher (Privacy tech, zero-knowledge)
5. **David Kim** - Full-stack Developer/DevRel (Developer tools, TypeScript)
6. **Lisa Thompson** - Venture Capital Associate (Infrastructure investments)
7. **Roberto Silva** - Technical Writer (Documentation, content strategy)
8. **Jennifer Park** - UX/UI Designer (Web3 applications, user adoption)

## Quick Usage

### Method 1: Chat Command (Easiest)

1. Set environment variable: `ALLOW_TEST_SEEDING=true` or `NODE_ENV=development`
2. Chat with Discover-Connection: "Please seed test data" or "Populate sample users"
3. Discover-Connection will automatically seed the database with sample users
4. Test connection discovery with queries like:
   - "Find me blockchain engineers for my datadao"
   - "I need community builders with Web3 experience"
   - "Looking for technical co-founders"

### Method 2: Direct Function Call

```typescript
import { seedDiscover-ConnectionTestData } from './src/utils/testDataSeeder.js';

// In your runtime setup or initialization
await seedDiscover-ConnectionTestData(runtime, {
  roomId: 'your-room-id', // Optional
  userCount: 8, // Optional, defaults to all users
  skipIfExists: true, // Optional, skip if data already exists
});
```

### Method 3: Script Runner (Development)

```bash
cd packages/plugin-discover-connection
bun run scripts/run-seed.js
```

## Environment Setup

For security, test data seeding only works when:

- `NODE_ENV=development`, OR
- `NODE_ENV=test`, OR
- `ALLOW_TEST_SEEDING=true`

## Testing Connection Discovery

After seeding, test Discover-Connection's connection discovery with these sample queries:

### For Amir's Datadao Protocol:

- "I need blockchain engineers for my datadao protocol"
- "Looking for community builders to help grow Web3 adoption"
- "Want to connect with technical co-founders in the data space"
- "Seeking partnerships with privacy-focused researchers"

### General Testing:

- "Find me VCs interested in infrastructure projects"
- "I need help with developer relations and documentation"
- "Looking for UX designers with Web3 experience"
- "Connect me with technical writers for blockchain projects"

## Expected Matches

With Amir's background (datadao protocol founder), the system should find high compatibility with:

- **Alex Chen** (blockchain engineer, data solutions expertise)
- **Sarah Martinez** (community building, Web3 growth)
- **Dr. Emily Wang** (data scientist, privacy-preserving tech)
- **Marcus Johnson** (product manager, decentralized data interest)

## Cleanup

To remove test data:

- Chat: "Clean up test data" or "Remove sample users"
- Or check your database for entries with `metadata.isTestData = true`

## Technical Details

### Data Structure

Each test user gets:

- Unique UUID as entity ID
- Rich persona context (300-400 words)
- Generated embeddings for vector similarity search
- Stored in `persona_contexts` table
- Tagged with `isTestData: true` for easy identification

### Vector Search

- Embeddings generated using your configured TEXT_EMBEDDING model
- Stored with proper database relationships
- Supports similarity search with configurable threshold (default: 0.6)
- Returns up to 10 potential matches per query

### Development Notes

- Test data is created with random timestamps within the last 7 days
- Each user has realistic tags for filtering/categorization
- Embeddings are generated from full persona contexts for accurate matching
- Error handling gracefully continues if individual users fail to create

## Troubleshooting

**No matches found after seeding:**

- Check that embeddings were generated successfully
- Verify data was stored in `persona_contexts` table
- Ensure vector search threshold isn't too high
- Check logs for embedding generation errors

**Permission errors:**

- Confirm environment variables are set correctly
- Check database write permissions
- Verify runtime has access to embedding models

**Seeding fails:**

- Check database connection
- Verify embedding model is available and configured
- Ensure sufficient API credits/rate limits
- Check logs for specific error details
