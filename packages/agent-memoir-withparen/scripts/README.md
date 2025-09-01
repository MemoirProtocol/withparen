# AgentWeb Scripts Directory

This directory contains all the configuration and deployment scripts specific to the **AgentWeb** agent running at `https://webchat.withseren.com`.

## 🚀 Deployment & Configuration Files

### Core Configuration

- **`nginx-agent.conf`** - Nginx configuration with HTTPS, rate limiting, and CORS for webchat.withseren.com
- **`setup-ssl.sh`** - Automated SSL certificate setup script with PM2 integration
- **`.env`** - Environment configuration (located in parent directory)

### Documentation

- **`deployment-instructions.md`** - Complete deployment guide with step-by-step instructions
- **`cloudflare-setup.md`** - Cloudflare DNS and proxy configuration guide
- **`integration-usage-guide.md`** - React integration documentation and examples

## 🔌 Integration Files

### React Components

- **`react-integration-example.js`** - Basic React integration with API client and chat widget
- **`websocket-integration.js`** - Advanced WebSocket integration with real-time messaging

## 📋 Agent Configuration

### Current Settings

- **Domain**: `webchat.withseren.com`
- **Agent ID**: `3c0b933c-a2c6-06f9-abdc-dbd48eb48314`
- **API Key**: `n13in13kfdjn13irju1i3d1i3d`
- **CORS Origins**: `https://withseren.com`, `https://www.withseren.com`
- **PM2 Service**: `web`

### Rate Limiting

- **Nginx Level**: 10 API requests/min, 30 chat requests/min per IP
- **WebSocket**: 5 connections/min per IP
- **Client Level**: 8 requests/min (backup)

## 🛠️ Usage Instructions

### Initial Setup

1. **Configure DNS**: Point `webchat.withseren.com` to your server IP
2. **Run SSL Setup**: `sudo ./setup-ssl.sh`
3. **Start Agent**: `pm2 start web` (if not already running)

### Updating Configuration

1. **Modify nginx config**: Edit `nginx-agent.conf`
2. **Apply changes**: `sudo cp nginx-agent.conf /etc/nginx/sites-available/webchat.withseren.com`
3. **Test config**: `sudo nginx -t`
4. **Reload nginx**: `sudo systemctl reload nginx`

### Integration with Landing Page

1. **Copy integration files**: Copy `react-integration-example.js` and `websocket-integration.js` to your React project
2. **Install dependencies**: `npm install socket.io-client`
3. **Follow integration guide**: See `integration-usage-guide.md`

## 🔧 Maintenance

### Check Status

```bash
# PM2 status
pm2 status

# Nginx status
sudo systemctl status nginx

# SSL certificate status
sudo certbot certificates
```

### View Logs

```bash
# Agent logs
pm2 logs web

# Nginx access logs
sudo tail -f /var/log/nginx/webchat.withseren.com.access.log

# Nginx error logs
sudo tail -f /var/log/nginx/webchat.withseren.com.error.log
```

### Test Endpoints

```bash
# Test HTTPS
curl -I https://webchat.withseren.com/health

# Test API with authentication
curl -H "X-API-KEY: n13in13kfdjn13irju1i3d1i3d" https://webchat.withseren.com/api/agents

# Test rate limiting
for i in {1..15}; do curl -I https://webchat.withseren.com/api/agents; done
```

## 🔒 Security Features

- **HTTPS**: SSL/TLS encryption with auto-renewal
- **Rate Limiting**: Multi-layer protection against abuse
- **CORS**: Restricted to authorized domains only
- **API Authentication**: X-API-KEY header required
- **Security Headers**: HSTS, CSP, XSS protection

## 📁 File Organization

This scripts directory is specific to the **AgentWeb** agent to:

- ✅ Prevent conflicts with other agents
- ✅ Keep configurations organized
- ✅ Enable easy backup and version control
- ✅ Facilitate agent-specific maintenance

## 🆘 Troubleshooting

### Common Issues

1. **CORS Errors**: Check nginx configuration and allowed origins
2. **SSL Issues**: Verify DNS resolution and certificate validity
3. **Rate Limiting**: Check nginx error logs for rate limit hits
4. **PM2 Issues**: Ensure service is running and environment is correct

### Support Files

- All documentation and troubleshooting guides are in this directory
- Check `deployment-instructions.md` for detailed troubleshooting steps
- Review `integration-usage-guide.md` for client-side issues

---

**Note**: This configuration is specific to the AgentWeb agent. Other agents should have their own scripts directories with their respective configurations.
