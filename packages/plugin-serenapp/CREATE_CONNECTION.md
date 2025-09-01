# Create Connection Action

The `createConnectionAction` allows users to create new human connections with waitlist status in the Seren app. This action extracts user information from conversations and stores it in a Memgraph database.

## How it Works

1. **Validation**: The action is available for any non-empty user message (completely permissive)
2. **Information Extraction**: Uses LLM to extract user name, partner name, and shared secret from conversation
3. **Database Storage**: Creates a new HumanConnection node with "waitlist" status in Memgraph
4. **Duplicate Prevention**: Checks for existing connections before creating new ones

## Onboarding Flow

The onboarding provider guides users through a structured conversation:

1. **Step 1**: Ask for the user's name
2. **Step 2**: Ask for their partner's name (separate question)
3. **Step 3**: Ask for a shared secret with examples
4. **Step 4**: CREATE_CONNECTION action triggers automatically when all info is collected

## Required Information

The action extracts three key pieces of information:

- **User Name**: The name of the person creating the connection
- **Partner Name**: The name of the person they want to connect with
- **Shared Secret**: A secret word or phrase that only they both know

## Example Conversation Flow

```
Agent: "Hello! 👋 I'm Seren, and I'm here to help you create a special connection invite. What's your name?"
User: "I'm Sarah"
Agent: "Nice to meet you, Sarah! Who would you like to deepen your connection with?"
User: "My partner Mike"
Agent: "Great! Now I need a shared secret that only you and Mike would know. For example, it could be 'The name of the coffee shop where we first met' or 'Your favorite pizza topping that I always tease you about'. What would you like to use?"
User: "Our secret word is 'sunset'"
[CREATE_CONNECTION action triggers]
Agent: "Perfect! I've created your connection with Mike using your secret 'sunset'..."
```

## Database Schema

The action creates HumanConnection nodes with the following properties:

```cypher
CREATE (hc:HumanConnection {
  partners: ["UserName", "PartnerName"],
  secret: "shared_secret",
  status: "waitlist",
  updatedAt: "2025-01-08T12:00:00.000Z"
})
```

## Configuration

### Environment Variables

The MemgraphService can be configured with these environment variables:

```env
MEMGRAPH_HOST=127.0.0.1
MEMGRAPH_PORT=7687
MEMGRAPH_USERNAME=
MEMGRAPH_PASSWORD=
```

### Character Integration

Add the action to your character's plugin configuration:

```typescript
import { serenappPlugin } from '@elizaos/plugin-serenapp';

const character = {
  // ... other character config
  plugins: [serenappPlugin],
  // ... rest of config
};
```

## Action Behavior

### Validation

- **Always available** for any non-empty message
- No complex keyword matching or restrictions
- Designed to be completely permissive in the serenapp context

### Handler

- Extracts information from conversation history
- No hardcoded callbacks - returns ActionResult for message handler to process
- Handles missing information gracefully
- Prevents duplicate connections

## Response Examples

### Successful Creation

```
"Perfect! I've created your connection with Mike using your secret 'sunset'. Your connection has been added to the waitlist and you'll be notified when it's ready for deeper conversations. Welcome to your Seren journey, Sarah!"
```

### Missing Information

```
"I need a bit more information to create your connection. Could you please provide your partner's name? For example: 'My name is [your name], I want to connect with [partner's name], and our secret word is [secret]'."
```

### Existing Connection

```
"It looks like a connection between Sarah and Mike with that secret already exists! The status is currently: waitlist."
```

## Testing

Run the tests with:

```bash
bun test src/__tests__/createConnection.test.ts
```

## Integration with plugin-seren

This action works in conjunction with the authentication system in `plugin-seren`:

1. **plugin-serenapp**: Creates HumanConnection nodes with "waitlist" status
2. **plugin-seren**: Authenticates users against existing HumanConnection nodes and links them to Person nodes

The workflow is:

1. User creates connection via serenapp → HumanConnection with "waitlist" status
2. User authenticates via seren → Links Person to existing HumanConnection
3. Status can be updated from "waitlist" to "active" when ready for deeper conversations
