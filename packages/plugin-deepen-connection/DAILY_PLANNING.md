# Daily Planning System

The Daily Planning System is a comprehensive feature that automatically generates personalized daily plans and check-in messages for relationship partners using the Deepen-Connection plugin.

## Overview

The system works by:

1. **Daily Planning Task** (6 AM): Scans all active HumanConnection nodes in Memgraph
2. **Individual Planning Tasks**: Generates personalized plans for each relationship pair
3. **Daily Check-in Tasks** (12 PM): Sends personalized check-in messages to users

## Architecture

### Services

#### DailyPlanningService

- **Location**: `src/services/dailyPlanning.ts`
- **Purpose**: Main orchestrator for the daily planning system
- **Key Methods**:
  - `executeDailyPlanning()`: Finds active connections and queues individual planning tasks
  - `executeSingleConnectionPlanning()`: Generates plans for a specific relationship pair
  - `scheduleCheckinTasks()`: Creates check-in tasks for midday execution

### Task Workers

The system registers three task workers:

1. **DAILY_PLANNING**: Runs at 6 AM daily, finds active connections
2. **DAILY_PLANNING_TASK**: Processes individual connection planning (queued)
3. **DAILY_CHECKIN_TASK**: Sends personalized check-ins at 12 PM (queued)

### Providers

#### dailyPlanProvider

- **Location**: `src/providers/dailyPlan.ts`
- **Purpose**: Adds user's daily plan to conversation context
- **Functions**:
  - `formatDailyPlan()`: Formats daily plan for context
  - `storeDailyPlan()`: Stores generated daily plan
  - `getDailyPlan()`: Retrieves daily plan for a user

### Prompt Templates

#### dailyPlanningTemplate

- **Location**: `src/utils/promptTemplates.ts`
- **Purpose**: LLM prompt for generating daily plans and check-in messages
- **Inputs**:
  - Person 1 & 2 information (name, userId)
  - Persona memories for both people
  - Connection insights for both people
  - Shared relationship context
  - Current date
- **Outputs**:
  - Personalized daily plan for each person (3-5 actionable items)
  - Personalized midday check-in message for each person

## Data Flow

```
6 AM Daily Planning Task
├── Query Memgraph for active HumanConnections
├── Filter connections with exactly 2 participants
├── Queue DAILY_PLANNING_TASK for each connection
└── Store completion status

Individual Planning Task (Queued)
├── Get persona memories for both participants
├── Get connection insights for both participants
├── Generate LLM prompt with all context
├── Parse LLM response for plans and check-ins
├── Store daily plans in cache
└── Schedule DAILY_CHECKIN_TASK for each person

12 PM Check-in Task (Queued)
├── Validate it's the right time (noon ±30 min)
├── Send personalized check-in message
└── Log completion
```

## Memgraph Requirements

The system expects the following graph structure:

```cypher
// Person nodes
(:Person {userId: string, name: string, roomId: string})

// HumanConnection nodes
(:HumanConnection {partners: [string], secret: string, status: "active"})

// Relationships
(:Person)-[:PARTICIPATES_IN]->(:HumanConnection)
```

### Required Queries

The system uses these Memgraph queries:

```cypher
// Get active connections with exactly 2 participants
MATCH (hc:HumanConnection)
WHERE hc.status = "active" OR NOT EXISTS(hc.status)
MATCH (p:Person)-[:PARTICIPATES_IN]->(hc)
WITH hc, collect(p) as participants
WHERE size(participants) = 2
RETURN hc, participants
```

## Memory Tables

The system reads from these memory tables:

- `persona_memories`: Personal insights and characteristics
- `connection_memories`: Relationship insights and patterns

## Cache Storage

Daily plans are stored in cache with keys:

- Format: `daily-plan-{userId}-{YYYY-MM-DD}`
- Contains: `{userId, date, plan, createdAt}`

## Configuration

### Environment Variables

The system uses standard Eliza runtime configuration. No additional environment variables required.

### Timing Configuration

- **Planning Time**: 6:00 AM (configurable via `PLANNING_HOUR`)
- **Check-in Time**: 12:00 PM (configurable via `CHECKIN_HOUR`)
- **Time Window**: 30 minutes (configurable via `PLANNING_MINUTE_WINDOW`)

## Usage

### Installation

The system is automatically enabled when the Deepen-Connection plugin is loaded:

```typescript
import { deepen-connectionPlugin } from '@elizaos/plugin-deepen-connection';

// Plugin includes DailyPlanningService automatically
const runtime = new AgentRuntime({
  plugins: [deepen-connectionPlugin],
  // ... other config
});
```

### Manual Triggers

For testing purposes:

```typescript
const planningService = runtime.getService('daily-planning');
await planningService.triggerTestPlanning();
```

### Monitoring

Check the last planning status:

```typescript
const planningService = runtime.getService('daily-planning');
const status = await planningService.getLastPlanningStatus();
console.log(status); // {date, connectionsProcessed}
```

## Testing

Run the test script to verify the system:

```bash
cd packages/plugin-deepen-connection
npx tsx test-daily-planning.ts
```

The test script will:

1. Verify template rendering
2. Test Memgraph connectivity
3. Initialize the daily planning service
4. Run a mock planning execution

## Troubleshooting

### Common Issues

1. **No active connections found**

   - Verify HumanConnection nodes have `status: "active"`
   - Ensure exactly 2 Person nodes participate in each connection

2. **Planning tasks not executing**

   - Check system time matches expected planning hours
   - Verify task workers are registered properly
   - Check logs for validation failures

3. **Check-ins not sending**

   - Verify roomId matches userId for DM conversations
   - Check message sending permissions
   - Ensure check-in tasks are properly scheduled

4. **Memory retrieval issues**
   - Verify persona_memories and connection_memories tables exist
   - Check entityId matches userId in memory queries
   - Ensure memory embeddings are properly created

### Logging

The system uses structured logging with the `[Deepen-Connection]` prefix:

```
[Deepen-Connection] Executing daily planning task
[Deepen-Connection] Found 3 active connections for daily planning
[Deepen-Connection] Generating daily plans for Alice and Bob
[Deepen-Connection] Successfully generated daily plans and scheduled check-ins
```

## Future Enhancements

Potential improvements:

1. **Timezone Support**: Handle different timezones for global users
2. **Plan Customization**: Allow users to customize planning preferences
3. **Progress Tracking**: Track completion of daily plan items
4. **Adaptive Scheduling**: Adjust timing based on user activity patterns
5. **Multi-language Support**: Generate plans in user's preferred language
