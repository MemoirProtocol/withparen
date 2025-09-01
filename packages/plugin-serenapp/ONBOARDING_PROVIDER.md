# Onboarding Provider

The `onboardingProvider` is a provider in the plugin-serenapp that dynamically provides different onboarding contexts based on the user's authentication status.

## Purpose

The onboarding provider determines which conversation flow to use based on whether the user has already signed in and has a Person node with authentication data in the Memgraph database.

## How it works

### 1. Person Node Check

The provider checks if a Person node exists for the user by:

- Extracting `webId` from `message.entityId` (same way userId is extracted in other parts of the system)
- Querying Memgraph for a Person node with matching `webId`
- Verifying that the Person node has a valid email address (not null or empty)

### 2. Context Selection

Based on the Person node check result:

#### If Person node exists with valid email:

- **Stage**: `connection_invite_creation`
- **Context**: `connectionInviteContext`
- **Purpose**: Guide user through creating connection invites with shared secrets
- **Flow**: Step-by-step process to collect user name, partner name, and shared secret

#### If Person node doesn't exist or has no email:

- **Stage**: `relationship_exploration`
- **Context**: `defaultOnboardingContext`
- **Purpose**: Explore the user's relationship goals and guide them toward sign-in
- **Flow**: Empathetic conversation about deepening connections

## Connection Invite Context Flow

When a user has already signed in (Person node with email exists):

1. **Step 1**: Welcome & Get User's Name
2. **Step 2**: Get Partner's Name
3. **Step 3**: Establish Shared Secret
4. **Step 4**: Trigger Connection Creation (via CREATE_CONNECTION action)

## Relationship Exploration Context Flow

When a user hasn't signed in yet (no Person node or no email):

1. Empathetic acknowledgment of their desire for deeper connection
2. Thoughtful questions about the relationship
3. Active listening and reflection
4. Gentle insights about relationships
5. Guide toward sign-in when appropriate

## Database Integration

The provider uses the `MemgraphService` to:

- Connect to the Memgraph database
- Query for Person nodes by `webId`
- Handle connection errors gracefully
- Always disconnect properly (using try/finally)

## Error Handling

The provider includes robust error handling:

- Database connection failures
- Query execution errors
- Graceful fallback to default context on any error
- Proper resource cleanup with finally blocks
- Comprehensive logging for debugging

## Return Values

The provider returns:

```typescript
{
  values: {
    onboardingStage: 'connection_invite_creation' | 'relationship_exploration',
    conversationType: 'app_onboarding',
  },
  data: {
    context: string, // The full context text
  },
  text: string, // The context text for the LLM
}
```

## Testing

The provider includes comprehensive tests covering:

- Person node exists with valid email
- Person node exists but no email
- Person node exists but empty email
- No Person node exists
- Database connection errors
- Query execution errors

Run tests with:

```bash
npm test -- onboarding.test.ts
```

## Integration

The onboarding provider works in conjunction with:

- **signin action**: Creates Person nodes when users authenticate
- **createConnection action**: Processes connection invites
- **MemgraphService**: Handles database operations

This creates a seamless flow from initial interest → authentication → connection creation.
