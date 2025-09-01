# ElizaOS Agent Deployment with HTTPS

## Prerequisites

1. **Domain Setup**: Point `webchat.withseren.com` to your server's IP in Cloudflare DNS
2. **Server Access**: SSH access to your server
3. **Nginx**: Installed on your server

## Step 1: Configure Cloudflare DNS

In your Cloudflare dashboard:
1. Add an A record: `webchat` → Your server IP
2. Set Proxy status to "DNS only" (gray cloud) initially
3. After SSL is working, you can enable Cloudflare proxy (orange cloud)

## Step 2: Install SSL Certificate

```bash
# Make the setup script executable
chmod +x /home/specialpedrito/agents/setup-ssl.sh

# Update the email in the script
nano /home/specialpedrito/agents/setup-ssl.sh
# Change: EMAIL="your-email@example.com" to your actual email

# Run the SSL setup
sudo /home/specialpedrito/agents/setup-ssl.sh
```

## Step 3: Update Environment Variables

Edit your `.env` file:
```bash
nano /home/specialpedrito/agents/packages/agentweb/.env
```

Update these values:
- Replace `your_secure_token_here` with a strong API token
- Replace `https://your-landing-page.com` with your actual landing page domain

## Step 4: Configure Nginx Rate Limiting

The nginx configuration includes:
- **API endpoints**: 10 requests/minute per IP
- **Chat endpoints**: 30 requests/minute per IP  
- **WebSocket**: 5 connections/minute per IP
- **Connection limit**: 10 concurrent connections per IP

## Step 5: Start Your Agent

```bash
cd /home/specialpedrito/agents/packages/agentweb
npm run start
```

## Step 6: Test the Setup

```bash
# Test HTTPS endpoint
curl -I https://webchat.withseren.com/health

# Test API endpoint
curl -X GET https://webchat.withseren.com/api/agents

# Test rate limiting (run multiple times quickly)
for i in {1..15}; do curl -I https://webchat.withseren.com/api/agents; done
```

## Step 7: Monitor and Logs

```bash
# Check nginx status
sudo systemctl status nginx

# View access logs
sudo tail -f /var/log/nginx/webchat.withseren.com.access.log

# View error logs
sudo tail -f /var/log/nginx/webchat.withseren.com.error.log

# Check SSL certificate
sudo certbot certificates
```

## Integration with React Landing Page

### Install Dependencies

```bash
npm install socket.io-client
```

### Basic Usage

```javascript
import { ElizaChatWidget } from './path/to/react-integration-example.js';

function App() {
  return (
    <div className="App">
      <ElizaChatWidget 
        agentId="your-agent-id"
        className="my-chat-widget"
      />
    </div>
  );
}
```

### Advanced Usage with WebSocket

```javascript
import { ElizaAdvancedChatWidget } from './path/to/websocket-integration.js';

function App() {
  return (
    <div className="App">
      <ElizaAdvancedChatWidget 
        agentId="your-agent-id"
        className="advanced-chat"
        rateLimit={{ maxRequests: 8, windowMs: 60000 }}
      />
    </div>
  );
}
```

## Security Considerations

1. **API Token**: Use a strong, unique token for `ELIZA_SERVER_AUTH_TOKEN`
2. **CORS**: Update `CORS_ORIGIN` to match your landing page domain exactly
3. **Rate Limiting**: Nginx handles server-side rate limiting
4. **SSL**: Certificates auto-renew via cron job
5. **Firewall**: Consider restricting access to port 3019 (only nginx should access it)

## Troubleshooting

### SSL Issues
```bash
# Check certificate status
sudo certbot certificates

# Renew manually if needed
sudo certbot renew --dry-run
```

### Rate Limiting Issues
```bash
# Check nginx error logs for rate limit hits
sudo grep "limiting requests" /var/log/nginx/webchat.withseren.com.error.log
```

### Agent Connection Issues
```bash
# Check if agent is running
curl http://127.0.0.1:3019/health

# Check agent logs
cd /home/specialpedrito/agents/packages/agentweb
npm run start
```

## Performance Optimization

1. **Enable Cloudflare Proxy**: After testing, enable orange cloud in Cloudflare for additional DDoS protection
2. **Caching**: Add caching headers for static content
3. **Compression**: Enable gzip compression in nginx
4. **Monitoring**: Set up monitoring for uptime and performance

## Cost Optimization for Google API

To prevent excessive Google API usage:

1. **Set API Quotas**: In Google Cloud Console, set daily/monthly quotas
2. **Monitor Usage**: Set up billing alerts
3. **Rate Limiting**: The nginx config already limits requests
4. **Caching**: Consider caching responses for similar queries

Your agent is now production-ready with HTTPS, rate limiting, and proper security!