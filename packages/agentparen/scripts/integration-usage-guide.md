# ElizaOS Integration Usage Guide

Your ElizaOS agent is now live at `https://webchat.withseren.com` with full HTTPS, rate limiting, and production-ready configuration.

## Quick Start

### 1. Basic React Integration

```jsx
import { ElizaChatWidget } from './react-integration-example.js';

function App() {
  return (
    <div className="App">
      <ElizaChatWidget agentId="3c0b933c-a2c6-06f9-abdc-dbd48eb48314" className="my-chat-widget" />
    </div>
  );
}
```

### 2. Advanced WebSocket Integration

```jsx
import { ElizaAdvancedChatWidget } from './websocket-integration.js';

function App() {
  return (
    <div className="App">
      <ElizaAdvancedChatWidget
        agentId="3c0b933c-a2c6-06f9-abdc-dbd48eb48314"
        className="advanced-chat"
        rateLimit={{ maxRequests: 8, windowMs: 60000 }}
      />
    </div>
  );
}
```

## Configuration Details

### Your Production Settings

- **Endpoint**: `https://webchat.withseren.com`
- **Agent ID**: `3c0b933c-a2c6-06f9-abdc-dbd48eb48314`
- **API Key**: `n13in13kfdjn13irju1i3d1i3d`
- **CORS Origin**: `https://withseren.com`

### Rate Limiting

- **Nginx Level**: 100 API requests/min, 300 chat requests/min per IP
- **Client Level**: 1000 requests/min (backup protection)
- **WebSocket**: 15 connections/min per IP

## Installation

### Dependencies

```bash
npm install socket.io-client
```

### CSS Styles

Add the provided CSS styles to your application:

```jsx
// Import styles
import { ChatWidgetStyles, AdvancedChatStyles } from './websocket-integration.js';

// Add to your CSS or styled-components
const GlobalStyles = createGlobalStyle`
  ${ChatWidgetStyles}
  ${AdvancedChatStyles}
`;
```

## API Endpoints

### Available Endpoints

- `GET /api/agents` - List all agents
- `GET /api/agents/:agentId` - Get agent details
- `POST /api/messaging/central-channels/:channelId/messages` - Send message
- `GET /api/messaging/central-channels/:channelId/messages` - Get messages
- `WebSocket /socket.io/` - Real-time communication

### Authentication

All API requests require the `X-API-KEY` header:

```javascript
headers: {
  'X-API-KEY': 'n13in13kfdjn13irju1i3d1i3d'
}
```

## Custom Implementation

### Using the API Client Directly

```javascript
import { ElizaAPIClient } from './react-integration-example.js';

const client = new ElizaAPIClient('https://webchat.withseren.com', 'n13in13kfdjn13irju1i3d1i3d');

// Get agents
const agents = await client.getAgents();

// Send message
await client.sendMessage(channelId, 'Hello!', {
  userId: 'user-123',
  userName: 'John Doe',
});
```

### Custom Hook Usage

```javascript
import { useElizaChat } from './react-integration-example.js';

function CustomChat() {
  const { messages, sendMessage, loading, error } = useElizaChat(
    '3c0b933c-a2c6-06f9-abdc-dbd48eb48314'
  );

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>{msg.content}</div>
      ))}
      <button onClick={() => sendMessage('Hello!')}>Send Message</button>
    </div>
  );
}
```

## Error Handling

### Common Errors

- **429 Rate Limited**: User exceeded rate limits
- **403 Forbidden**: Invalid API key or CORS issue
- **500 Server Error**: Agent or server issue

### Error Handling Example

```javascript
try {
  await client.sendMessage(channelId, message);
} catch (error) {
  if (error.message.includes('Rate limit')) {
    // Show rate limit message
    setError('Please wait before sending another message');
  } else if (error.message.includes('403')) {
    // Authentication issue
    setError('Authentication failed');
  } else {
    // Generic error
    setError('Failed to send message');
  }
}
```

## Testing

### Test the API

```bash
# Test agent list
curl -H "X-API-KEY: n13in13kfdjn13irju1i3d1i3d" \
  https://webchat.withseren.com/api/agents

# Test rate limiting (run multiple times)
for i in {1..15}; do
  curl -H "X-API-KEY: n13in13kfdjn13irju1i3d1i3d" \
    https://webchat.withseren.com/api/agents
done
```

### Test WebSocket Connection

```javascript
// In browser console
const socket = io('https://webchat.withseren.com');
socket.on('connect', () => console.log('Connected!'));
socket.on('disconnect', () => console.log('Disconnected!'));
```

## Deployment to AWS Amplify

### 1. Copy Integration Files

Copy these files to your React project:

- `react-integration-example.js`
- `websocket-integration.js`

### 2. Install Dependencies

```bash
npm install socket.io-client
```

### 3. Environment Variables (Optional)

Create `.env` in your React project:

```
REACT_APP_ELIZA_ENDPOINT=https://webchat.withseren.com
REACT_APP_ELIZA_API_KEY=n13in13kfdjn13irju1i3d1i3d
REACT_APP_ELIZA_AGENT_ID=3c0b933c-a2c6-06f9-abdc-dbd48eb48314
```

### 4. Use Environment Variables

```javascript
const client = new ElizaAPIClient(
  process.env.REACT_APP_ELIZA_ENDPOINT,
  process.env.REACT_APP_ELIZA_API_KEY
);
```

## Monitoring

### Check Agent Status

```bash
# PM2 status
pm2 status

# Nginx status
sudo systemctl status nginx

# View logs
pm2 logs web
sudo tail -f /var/log/nginx/webchat.withseren.com.access.log
```

### SSL Certificate

```bash
# Check certificate expiration
sudo certbot certificates

# Test renewal
sudo certbot renew --dry-run
```

## Security Notes

1. **API Key**: Keep your API key secure, don't expose it in client-side code in production
2. **CORS**: Only `https://withseren.com` can access the API
3. **Rate Limiting**: Multiple layers prevent abuse
4. **HTTPS**: All communication is encrypted
5. **Auto-renewal**: SSL certificates renew automatically

## Support

If you encounter issues:

1. Check the browser console for errors
2. Verify CORS settings match your domain
3. Test API endpoints with curl
4. Check PM2 and nginx logs
5. Ensure DNS is properly configured

Your ElizaOS agent is now production-ready and can be integrated into any React application!
