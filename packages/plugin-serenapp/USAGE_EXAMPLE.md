# Usage Example: Create Connection Action

This example demonstrates how the `createConnectionAction` works in practice.

## Setup

1. **Install the plugin** in your character configuration:

```typescript
import { serenappPlugin } from '@elizaos/plugin-serenapp';

const character = {
  name: 'Seren',
  plugins: [serenappPlugin],
  // ... other character config
};
```

2. **Configure Memgraph connection** (optional environment variables):

```env
MEMGRAPH_HOST=127.0.0.1
MEMGRAPH_PORT=7687
MEMGRAPH_USERNAME=
MEMGRAPH_PASSWORD=
```

## User Interaction Flow

### Step 1: User Initiates Connection Creation

**User:** "Hi! I want to create a connection. My name is Sarah and I want to connect with my partner Mike. Our secret word is 'sunset'."

### Step 2: Action Validation

The `createConnectionAction.validate()` method checks for:

- Connection keywords: ✅ "create a connection"
- Name patterns: ✅ "My name is Sarah"
- Secret patterns: ✅ "secret word is 'sunset'"

### Step 3: Information Extraction

The action uses LLM to extract:

```xml
<response>
    <userName>Sarah</userName>
    <partnerName>Mike</partnerName>
    <secret>sunset</secret>
    <confidence>high</confidence>
    <missing></missing>
</response>
```

### Step 4: Database Operations

1. **Check for existing connection:**

   ```cypher
   MATCH (hc:HumanConnection)
   WHERE hc.secret = "sunset"
   AND (
     (hc.partners[0] = "Sarah" AND hc.partners[1] = "Mike") OR
     (hc.partners[0] = "Mike" AND hc.partners[1] = "Sarah")
   )
   RETURN hc
   ```

2. **Create new connection (if none exists):**
   ```cypher
   CREATE (hc:HumanConnection {
     partners: ["Sarah", "Mike"],
     secret: "sunset",
     status: "waitlist",
     updatedAt: "2025-01-08T12:00:00.000Z"
   })
   RETURN hc
   ```

### Step 5: Success Response

**Agent:** "Perfect! I've created your connection with Mike using your secret 'sunset'. Your connection has been added to the waitlist and you'll be notified when it's ready for deeper conversations. Welcome to your Seren journey, Sarah!"

## Error Handling Examples

### Missing Information

**User:** "I want to create a connection with my partner."

**Agent:** "I need a bit more information to create your connection. Could you please provide your name, your partner's name and your secret word or phrase? For example: 'My name is [your name], I want to connect with [partner's name], and our secret word is [secret]'."

### Existing Connection

**User:** "My name is Sarah, I want to connect with Mike, our secret is 'sunset'."

**Agent:** "It looks like a connection between Sarah and Mike with that secret already exists! The status is currently: waitlist."

### Database Error

**Agent:** "I encountered an issue while creating your connection. Please try again or contact support if the problem persists."

## Integration with plugin-seren

After a connection is created in `plugin-serenapp` with "waitlist" status, users can authenticate in `plugin-seren`:

1. **plugin-serenapp**: Creates `HumanConnection` with status "waitlist"
2. **plugin-seren**: Authenticates users and links them to existing `HumanConnection`
3. Status can be updated from "waitlist" to "active" when ready

## Database Schema

```cypher
// Node created by plugin-serenapp
(:HumanConnection {
  partners: ["UserName", "PartnerName"],
  secret: "shared_secret",
  status: "waitlist",  // Always "waitlist" for new connections
  updatedAt: "2025-01-08T12:00:00.000Z"
})

// Node created by plugin-seren (when user authenticates)
(:Person {
  userId: "user-uuid",
  name: "UserName",
  pronouns: "",
  updatedAt: "2025-01-08T12:00:00.000Z"
})

// Relationship created by plugin-seren
(:Person)-[:PARTICIPATES_IN {role: "partner", updatedAt: "..."}]->(:HumanConnection)
```

This creates a complete workflow where users can create connections via the web app and then authenticate via the main Seren application.
