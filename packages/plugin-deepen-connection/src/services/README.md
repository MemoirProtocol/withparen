# Deepen-Connection Services

This directory contains the background services for the Deepen-Connection plugin.

## Services

### DailyCheckinService

- **Purpose**: Sends daily check-in messages to all users at noon
- **Schedule**: Every day at 12:00 PM (with 5-minute window)
- **Functionality**: Asks users to rate their relationship connection on a 1-5 scale

### TaskService

- **Purpose**: Manages and executes scheduled tasks
- **Functionality**: Handles the execution of recurring tasks like daily check-ins and weekly reflections

## Testing

### Manual Testing of Daily Check-in

```typescript
// Get the service instance
const dailyCheckinService = runtime.getService('daily-checkin');

// Trigger test check-in (bypasses time validation)
await dailyCheckinService.triggerTestCheckin();

// Check last check-in status
const status = await dailyCheckinService.getLastCheckinStatus();
console.log('Last check-in status:', status);
```

## Memory Tables Used

- **messages**: Stores conversation messages
- **persona_memories**: Stores persona insights extracted from conversations
- **connection_memories**: Stores connection insights extracted from conversations

## Configuration

Both services use the task system and will automatically create their required tasks on startup. The tasks are configured with:

- **Daily Check-in**: Runs every hour, validates for noon timing
- **Weekly Reflection**: Runs every hour, validates for Friday 5 PM timing

## Monitoring

Both services store their execution status in the runtime cache:

- `daily-checkin-last-run`: Contains last daily check-in execution details
- `weekly-reflection-last-run`: Contains last weekly reflection execution details
