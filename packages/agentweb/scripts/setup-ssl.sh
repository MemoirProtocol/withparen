#!/bin/bash

# SSL Certificate Setup for webchat.withseren.com with PM2 Integration
# This script sets up SSL certificates using Certbot (Let's Encrypt)
#
# Env overrides:
#   DOMAIN           primary domain (default: webchat.withseren.com)
#   EMAIL            certbot email (default: admin@withseren.com)
#   PM2_SERVICE      pm2 process name (default: web)
#   INCLUDE_ADMIN    if "1", also obtain SAN for admin.<domain>

set -e

DOMAIN="${DOMAIN:-webchat.withseren.com}"
EMAIL="${EMAIL:-admin@withseren.com}"  # Replace with your email
NGINX_CONFIG="/home/specialpedrito/agents/packages/agentweb/scripts/nginx-agent.conf"
PM2_SERVICE="${PM2_SERVICE:-web}"
INCLUDE_ADMIN="${INCLUDE_ADMIN:-1}"

echo "🔐 Setting up SSL certificates for $DOMAIN with PM2 integration"

# Check if PM2 service is running (as the user, not root)
if ! su - specialpedrito -c "pm2 list | grep -q '$PM2_SERVICE.*online'"; then
    echo "❌ PM2 service '$PM2_SERVICE' not found or not running. Please start your service first."
    echo "Current PM2 services:"
    su - specialpedrito -c "pm2 list"
    exit 1
fi

echo "✅ Found PM2 service '$PM2_SERVICE' running"

# Install certbot if not already installed
if ! command -v certbot &> /dev/null; then
    echo "📦 Installing certbot..."
    sudo apt update
    sudo apt install -y certbot python3-certbot-nginx
fi

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "📦 Installing nginx..."
    sudo apt update
    sudo apt install -y nginx
fi

# Stop nginx temporarily if running
if systemctl is-active --quiet nginx; then
    echo "⏹️  Stopping nginx temporarily..."
    sudo systemctl stop nginx
fi

# Obtain SSL certificate (include admin.<domain> as SAN if requested)
echo "🔑 Obtaining SSL certificate..."
CERTBOT_DOMAINS=( "-d" "$DOMAIN" )
if [ "$INCLUDE_ADMIN" = "1" ]; then
    CERTBOT_DOMAINS+=( "-d" "admin.$DOMAIN" )
fi

sudo certbot certonly --standalone \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    "${CERTBOT_DOMAINS[@]}"

# Update nginx configuration with correct certificate paths
echo "📝 Updating nginx configuration..."
sudo sed -i "s|/etc/ssl/certs/webchat.withseren.com.pem|/etc/letsencrypt/live/$DOMAIN/fullchain.pem|g" $NGINX_CONFIG
sudo sed -i "s|/etc/ssl/private/webchat.withseren.com.key|/etc/letsencrypt/live/$DOMAIN/privkey.pem|g" $NGINX_CONFIG

# Copy nginx configuration to sites-available
echo "📋 Installing nginx configuration..."
sudo cp $NGINX_CONFIG /etc/nginx/sites-available/webchat.withseren.com
sudo ln -sf /etc/nginx/sites-available/webchat.withseren.com /etc/nginx/sites-enabled/

# Remove default nginx site if it exists
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
sudo nginx -t

# Start nginx
echo "🚀 Starting nginx..."
sudo systemctl start nginx
sudo systemctl enable nginx

# Restart PM2 service to ensure it picks up new environment variables
echo "🔄 Restarting PM2 service '$PM2_SERVICE'..."
su - specialpedrito -c "pm2 restart $PM2_SERVICE"

# Set up automatic certificate renewal with PM2 restart
echo "🔄 Setting up automatic certificate renewal..."
sudo crontab -l 2>/dev/null | grep -v certbot | sudo crontab -
(sudo crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet --post-hook 'systemctl reload nginx && su - specialpedrito -c \"pm2 restart $PM2_SERVICE\"'") | sudo crontab -

echo "✅ SSL setup complete with PM2 integration!"
echo "🌐 Your agent is now available at: https://$DOMAIN"
echo "📊 Check nginx status: sudo systemctl status nginx"
echo "📊 Check PM2 status: pm2 status"
echo "📜 View nginx logs: sudo tail -f /var/log/nginx/webchat.withseren.com.access.log"
echo "📜 View PM2 logs: pm2 logs $PM2_SERVICE"

# Test the endpoint
echo "🔍 Testing endpoint..."
sleep 3
curl -I https://$DOMAIN/health || echo "⚠️  Health check failed - checking PM2 service..."

# Check PM2 service status
echo "📊 PM2 Service Status:"
su - specialpedrito -c "pm2 show $PM2_SERVICE --no-colors"

echo ""
echo "🎉 Setup complete! Your ElizaOS agent is now running with HTTPS!"
echo "💡 Next steps:"
echo "   1. Configure Cloudflare DNS"
echo "   2. Test the API endpoints"
echo "   3. Update your React integration"