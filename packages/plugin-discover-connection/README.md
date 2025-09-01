# Plugin Discover-Connection

Discover-Connection is an AI agent focused on connection discovery. Unlike Seren which focuses on deepening existing connections, Discover-Connection helps users discover new meaningful connections based on their passions, challenges, and connection preferences.

## Features

- **Onboarding Narrative**: Guides users through discovering their passions, challenges, and connection preferences
- **Persona Memory**: Tracks user background, goals, and preferences using the PEACOCK framework
- **Connection Discovery Insights**: Captures the type of connections users wish to discover
- **Vector-based Matchmaking**: Uses similarity search to find compatible connections
- **Smart Reasoning**: Evaluates mutual compatibility between potential matches

## How It Works

### 1. Onboarding Process

Discover-Connection creates a natural conversation to understand:

- **Passions & Work**: What users are passionate about and currently working on
- **Challenges & Growth**: Where they face obstacles and need support
- **Connection Preferences**: What type of connections would help them grow

### 2. Profile Building

- Uses **personaMemory** provider to track user background using PEACOCK dimensions:
  - demographic, characteristic, routine, goal, experience, persona_relationship, emotional_state
- Uses **connectionMemory** provider to capture connection discovery preferences:
  - desired_type, desired_background, desired_goals, desired_experience, desired_communication, desired_value

### 3. Connection Discovery

When users are ready, they can trigger the "Discover Connection" action:

1. **Context Generation**: Creates personaContext (user's profile) and connectionContext (ideal match profile)
2. **Vector Search**: Performs similarity search across all user profiles
3. **Compatibility Analysis**: Uses reasoning to evaluate mutual compatibility
4. **Match Recommendation**: Suggests the best match for introduction

### 4. Reflection & Learning

The reflection evaluator continuously extracts insights from conversations to improve matching:

- Persona insights about the user themselves
- Connection discovery insights about what they're looking for

## Installation

```bash
npm install @elizaos/plugin-discover-connection
```

## Usage

Add to your agent configuration:

```typescript
import { discoverConnectionPlugin } from '@elizaos/plugin-discover-connection';

const agent = {
  plugins: [discoverConnectionPlugin],
  // ... other config
};
```

## Key Actions

- **DISCOVER_CONNECTION**: Main action for finding compatible connections
- **REPLY**: Standard conversation responses
- **IGNORE**: Skip responding to certain messages

## Key Providers

- **ONBOARDING**: Guides connection discovery onboarding flow
- **PERSONA_MEMORY**: Formats user persona insights
- **CONNECTION_MEMORY**: Formats connection discovery preferences

## Key Evaluators

- **DISCOVER-CONNECTION_REFLECTION**: Extracts persona and connection discovery insights from conversations

## Dependencies

- @elizaos/core
- @elizaos/plugin-sql
- @elizaos/api-client

## Database Tables

Discover-Connection uses the following SQL database tables:

- `persona_*` tables for PEACOCK framework dimensions
- `connection_*` tables for connection discovery preferences
- `persona_contexts` for generated user profiles
- `connection_contexts` for generated ideal match profiles

## Differences from Seren

- **Focus**: Connection discovery vs. connection deepening
- **Database**: SQL-only (no Memgraph dependency)
- **Matching**: Vector similarity search for compatibility
- **Goal**: Help users find new connections vs. strengthen existing ones
