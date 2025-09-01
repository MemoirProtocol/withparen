# Cloudflare DNS Configuration for webchat.withseren.com

## Step 1: Add DNS Record

In your Cloudflare dashboard for `withseren.com`:

1. **Go to DNS > Records**
2. **Add a new A record:**
   - **Type**: A
   - **Name**: `webchat`
   - **IPv4 address**: `YOUR_SERVER_IP` (replace with your actual server IP)
   - **Proxy status**: 🟡 DNS only (gray cloud) - **IMPORTANT: Start with this**
   - **TTL**: Auto

## Step 2: Verify DNS Propagation

Before running the SSL setup, verify the DNS is working:

```bash
# Check if DNS is resolving
nslookup webchat.withseren.com

# Or use dig
dig webchat.withseren.com

# Should return your server's IP address
```

## Step 3: SSL Certificate Setup

Once DNS is resolving, run the SSL setup:

```bash
sudo /home/specialpedrito/agents/setup-ssl.sh
```

## Step 4: Enable Cloudflare Proxy (After SSL Works)

**ONLY after SSL is working**, you can enable Cloudflare's proxy:

1. **Go back to DNS > Records**
2. **Click on the webchat A record**
3. **Change Proxy status to**: 🟠 Proxied (orange cloud)
4. **Save**

## Step 5: Cloudflare SSL/TLS Settings

With proxy enabled, configure these settings:

### SSL/TLS > Overview

- **SSL/TLS encryption mode**: Full (strict)

### SSL/TLS > Edge Certificates

- **Always Use HTTPS**: On
- **HTTP Strict Transport Security (HSTS)**: Enable
  - Max Age Header: 6 months
  - Include subdomains: On
  - No-Sniff header: On

### Security > Settings

- **Security Level**: Medium
- **Bot Fight Mode**: On
- **Challenge Passage**: 30 minutes

### Speed > Optimization

- **Auto Minify**:
  - JavaScript: On
  - CSS: On
  - HTML: On
- **Brotli**: On

### Firewall > Tools

- **Rate Limiting**: (Optional - you already have nginx rate limiting)
  - If you want additional protection, create rules:
    - `/api/*`: 20 requests per minute
    - `/socket.io/*`: 10 requests per minute

## Step 6: Page Rules (Optional)

Create page rules for better performance:

1. **Rule 1**: `webchat.withseren.com/api/*`

   - Cache Level: Bypass
   - Disable Apps
   - Disable Performance

2. **Rule 2**: `webchat.withseren.com/*`
   - Always Use HTTPS
   - Browser Cache TTL: 4 hours

## Important Notes

### ⚠️ DNS Only First

- **Always start with DNS only (gray cloud)**
- Only enable proxy after SSL certificate is obtained
- Cloudflare proxy can interfere with Let's Encrypt validation

### 🔄 Certificate Renewal

- With proxy enabled, certificate renewal happens automatically
- The cron job will handle renewals behind Cloudflare

### 🛡️ Security Benefits with Proxy

- DDoS protection
- Web Application Firewall (WAF)
- Bot protection
- Additional rate limiting
- Global CDN

### 📊 Monitoring

- Use Cloudflare Analytics to monitor traffic
- Set up alerts for high error rates
- Monitor SSL certificate expiration

## Testing After Setup

```bash
# Test HTTPS
curl -I https://webchat.withseren.com/health

# Test API
curl -H "X-API-KEY: n13in13kfdjn13irju1i3d1i3d" https://webchat.withseren.com/api/agents

# Test WebSocket (from browser console)
const socket = io('https://webchat.withseren.com');
socket.on('connect', () => console.log('Connected!'));
```

## Troubleshooting

### DNS Not Resolving

- Wait 5-10 minutes for DNS propagation
- Check if you're using the correct subdomain name
- Verify the IP address is correct

### SSL Certificate Issues

- Ensure DNS is resolving before running certbot
- Check if port 80 is accessible from the internet
- Temporarily disable Cloudflare proxy during certificate generation

### 522 Connection Timed Out (with proxy enabled)

- Check if your server is accessible on port 443
- Verify nginx is running and configured correctly
- Check firewall settings

Your server IP address is needed for the DNS configuration. You can find it with:

```bash
curl -4 ifconfig.me
```
