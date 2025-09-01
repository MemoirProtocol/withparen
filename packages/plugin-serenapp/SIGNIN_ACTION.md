# Signin Action

The `signinAction` is a new action added to the plugin-serenapp that handles user authentication and creates Person nodes in the Memgraph database.

## Purpose

When a user authenticates through Firebase in the frontend, the frontend sends a message containing Firebase identity data. This action extracts that information and creates or updates a Person node in the Memgraph database with the user's authentication details.

## How it works

### 1. Validation

The action validates incoming messages by checking if they contain:

- The text "Firebase identity data"
- The text "successfully authenticated"

### 2. Data Extraction

From the message content, it extracts:

- **email**: User's email address from Firebase
- **firebaseId**: Firebase user ID
- **firebaseToken**: Firebase authentication token
- **webId**: From `message.entityId` (the user's web session ID)
- **authorId**: Extracted from Firebase payload

### 3. Database Operations

- Connects to Memgraph database
- Checks if Person node already exists with the same webId
- Creates new Person node only if one doesn't exist
- Skips creation and uses existing node if found
- Prevents duplicate Person nodes from multiple signin attempts

### 4. Silent Operation

- Operates silently in the background without generating responses
- Returns success status and extracted data
- Allows normal message handler flow to continue
- Handles errors gracefully without disrupting conversation

## Person Node Schema

The Person node in Memgraph contains:

```typescript
interface PersonNode {
  webId: string; // Primary identifier from message.entityId
  email?: string; // User's email from Firebase
  firebaseId?: string; // Firebase user ID
  firebaseToken?: string; // Firebase authentication token
  authorId?: string; // Author ID from Firebase payload
  createdAt: string; // ISO timestamp of creation
  updatedAt: string; // ISO timestamp of last update
}
```

## Example Message Format

The action expects messages like:

```
User has successfully authenticated. Firebase identity data:
{
  "id": "yqmQLF9796MGTUVRlPd0Ol6SgRk1",
  "email": "user@example.com",
  "token": "eyJhbGciOiJSUzI1NiIs...",
  "authorId": "author123",
  "emailVerified": true
}
```

## Error Handling

The action handles several error scenarios:

- Invalid JSON in Firebase data
- Database connection failures
- Missing required fields
- Memgraph service errors

All errors are logged and return appropriate error responses to the user.

## Testing

The action includes comprehensive tests covering:

- Message validation
- Data extraction
- Person node creation
- Duplicate Person node detection
- Skipping creation when Person already exists
- Error handling scenarios

Run tests with:

```bash
npm test -- signin.test.ts
```

## Action Availability

**Important**: The signin action is **not included** in the plugin's available actions list for the LLM. Instead, it's triggered deterministically through Firebase payload detection in the main message handler. This ensures:

- Reliable authentication processing
- No dependency on LLM action selection
- Cleaner separation between authentication and conversation logic
- Silent background operation without disrupting normal conversation flow

## Silent Background Operation

The signin action operates silently in the background:

- **No response generation**: Does not create its own response text
- **No callback usage**: Does not interrupt the normal message flow
- **Background processing**: Handles authentication while letting normal conversation continue
- **Seamless integration**: User experiences normal conversation flow while authentication happens behind the scenes
