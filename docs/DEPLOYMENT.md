# Deployment Guide

Complete guide for deploying MyClinicSoft to production.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Production Deployment](#production-deployment)
4. [Database Setup](#database-setup)
5. [External Services](#external-services)
6. [DNS & SSL Configuration](#dns--ssl-configuration)
7. [Monitoring & Logging](#monitoring--logging)
8. [Backup & Recovery](#backup--recovery)
9. [Scaling](#scaling)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

**Server (Production)**:
- Node.js: 18.17+ or 20.x
- MongoDB: 5.0+
- RAM: 4GB minimum (8GB recommended)
- Storage: 20GB minimum (SSD recommended)
- OS: Ubuntu 20.04+ / Debian 11+ / CentOS 8+

**Development**:
- Node.js: 18.17+
- MongoDB: 5.0+ (local or Atlas)
- Git

### Required Accounts

1. **Vercel** (hosting) - [vercel.com](https://vercel.com)
2. **MongoDB Atlas** (database) - [mongodb.com/atlas](https://mongodb.com/atlas)
3. **Cloudinary** (image storage) - [cloudinary.com](https://cloudinary.com)
4. **Twilio** (SMS) - [twilio.com](https://twilio.com) *(optional)*
5. **SMTP Provider** (email) - Gmail, SendGrid, etc.
6. **Sentry** (error tracking) - [sentry.io](https://sentry.io) *(optional)*

---

## Environment Setup

### 1. Environment Variables

Create `.env.production` file:

```bash
# App
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://myclinicsoft.com

# Database
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/myclinic?retryWrites=true&w=majority

# Authentication
JWT_SECRET=<generate-strong-random-string>
JWT_EXPIRY=24h
NEXTAUTH_SECRET=<generate-strong-random-string>
NEXTAUTH_URL=https://myclinicsoft.com

# Cloudinary (Image Storage)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=your-secret-key

# Twilio (SMS - Optional)
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@myclinic.com
SMTP_PASS=your-app-password

# Sentry (Error Tracking - Optional)
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_AUTH_TOKEN=your-auth-token

# n8n Webhooks (Automation - Optional)
N8N_WEBHOOK_URL=https://n8n.myclinic.com/webhook

# Encryption (for sensitive data)
ENCRYPTION_KEY=<32-byte-hex-string>
```

### 2. Generate Secrets

```bash
# JWT_SECRET (64 chars)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# NEXTAUTH_SECRET (32 chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ENCRYPTION_KEY (32 bytes = 64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Production Deployment

### Option 1: Vercel (Recommended)

#### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

#### Step 2: Login

```bash
vercel login
```

#### Step 3: Configure Project

```bash
# Initialize Vercel project
vercel

# Follow prompts:
# - Link to existing project? No
# - Project name: myclinicsoft
# - Directory: ./ (current)
# - Override settings? No
```

#### Step 4: Set Environment Variables

```bash
# Set all environment variables
vercel env add MONGODB_URI production
vercel env add JWT_SECRET production
vercel env add NEXTAUTH_SECRET production
vercel env add CLOUDINARY_CLOUD_NAME production
# ... (repeat for all variables)

# Or import from .env file
vercel env pull .env.production
```

#### Step 5: Deploy

```bash
# Deploy to production
vercel --prod

# Or use GitHub integration for automatic deployments
```

#### Step 6: Configure Custom Domain

```bash
vercel domains add myclinicsoft.com
vercel domains add *.myclinicsoft.com  # For multi-tenant subdomains
```

**Vercel Configuration** (`vercel.json`):

```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/next"
    }
  ],
  "env": {
    "MONGODB_URI": "@mongodb-uri",
    "JWT_SECRET": "@jwt-secret"
  },
  "regions": ["sin1"],
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 60
    }
  }
}
```

---

### Option 2: Docker + VPS

#### Step 1: Create Dockerfile

```dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

#### Step 2: Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - MONGODB_URI=${MONGODB_URI}
      - JWT_SECRET=${JWT_SECRET}
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
    restart: unless-stopped
    depends_on:
      - mongodb

  mongodb:
    image: mongo:5
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASS}
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - app
    restart: unless-stopped

volumes:
  mongo_data:
```

#### Step 3: Build & Deploy

```bash
# Build
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

---

### Option 3: Traditional VPS (PM2)

#### Step 1: Install Node.js

```bash
# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version
npm --version
```

#### Step 2: Clone Repository

```bash
cd /var/www
sudo git clone https://github.com/yourorg/clinic-management.git
cd clinic-management
```

#### Step 3: Install Dependencies

```bash
npm ci --production
```

#### Step 4: Build Application

```bash
npm run build
```

#### Step 5: Install PM2

```bash
sudo npm install -g pm2
```

#### Step 6: Create PM2 Ecosystem File

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'myclinic',
    script: 'npm',
    args: 'start',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
```

#### Step 7: Start Application

```bash
# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 startup script
pm2 startup systemd
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME

# View logs
pm2 logs myclinic

# Monitor
pm2 monit
```

---

## Database Setup

### MongoDB Atlas (Recommended)

#### Step 1: Create Cluster

1. Go to [mongodb.com/atlas](https://mongodb.com/atlas)
2. Create account and cluster (M10+ for production)
3. Choose region closest to your users
4. Enable backups (automatic in paid tiers)

#### Step 2: Configure Network Access

1. Navigate to Network Access
2. Add IP addresses:
   - Vercel IPs (if using Vercel)
   - Your VPS IP
   - Development IPs
3. Or allow all: `0.0.0.0/0` (less secure)

#### Step 3: Create Database User

1. Navigate to Database Access
2. Add new user with read/write permissions
3. Save username and strong password

#### Step 4: Get Connection String

```
mongodb+srv://username:password@cluster.mongodb.net/myclinic?retryWrites=true&w=majority
```

#### Step 5: Create Indexes

```bash
# Connect to MongoDB
mongosh "mongodb+srv://cluster.mongodb.net/myclinic" --username your-user

# Create indexes
use myclinic

db.patients.createIndex({ tenantIds: 1, patientCode: 1 }, { unique: true })
db.patients.createIndex({ tenantIds: 1, email: 1 })
db.appointments.createIndex({ tenantId: 1, doctor: 1, appointmentDate: 1 })
db.visits.createIndex({ tenantId: 1, patient: 1, date: -1 })
db.queue.createIndex({ tenantId: 1, status: 1, queuedAt: 1 })
db.invoices.createIndex({ tenantId: 1, paymentStatus: 1 })
db.auditlogs.createIndex({ tenantId: 1, timestamp: -1 })
db.users.createIndex({ email: 1 }, { unique: true })
db.tenants.createIndex({ subdomain: 1 }, { unique: true })
```

---

## External Services

### Cloudinary Setup

1. **Create Account**: [cloudinary.com](https://cloudinary.com)
2. **Get Credentials**:
   - Cloud Name
   - API Key
   - API Secret
3. **Configure Upload Preset**:
   - Go to Settings → Upload
   - Create unsigned upload preset: `clinic_uploads`
   - Set folder: `clinics/{tenant_id}`
4. **Set Environment Variables** in `.env.production`

### Twilio SMS Setup

1. **Create Account**: [twilio.com](https://twilio.com)
2. **Verify Phone Number**
3. **Get Credentials**:
   - Account SID
   - Auth Token
   - Phone Number
4. **Set Environment Variables**

### Email (Gmail SMTP) Setup

1. **Enable 2FA** on Google account
2. **Create App Password**:
   - Google Account → Security → 2-Step Verification
   - App passwords → Generate
3. **Configure SMTP**:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=<app-password>
   ```

### Sentry Error Tracking

1. **Create Account**: [sentry.io](https://sentry.io)
2. **Create Project**: Select Next.js
3. **Get DSN**: Copy from project settings
4. **Configure**:
   ```bash
   npx @sentry/wizard@latest -i nextjs
   ```
5. **Set Environment Variable**: `NEXT_PUBLIC_SENTRY_DSN`

---

## DNS & SSL Configuration

### DNS Setup (Cloudflare)

1. **Add Domain** to Cloudflare
2. **Update Nameservers** at domain registrar
3. **Add DNS Records**:

```
Type    Name    Content                  Proxy
A       @       <vercel-ip>             ✓ Proxied
CNAME   *       myclinicsoft.com        ✓ Proxied
CNAME   www     myclinicsoft.com        ✓ Proxied
```

4. **Configure SSL**:
   - SSL/TLS → Full (strict)
   - Edge Certificates → Always Use HTTPS
   - Minimum TLS Version: 1.2

### SSL Certificate (Let's Encrypt)

For VPS deployments:

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d myclinicsoft.com -d *.myclinicsoft.com

# Auto-renewal (already configured)
sudo certbot renew --dry-run
```

### Nginx Configuration

Create `/etc/nginx/sites-available/myclinic`:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name myclinicsoft.com *.myclinicsoft.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name myclinicsoft.com *.myclinicsoft.com;

    ssl_certificate /etc/letsencrypt/live/myclinicsoft.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/myclinicsoft.com/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/myclinic /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Monitoring & Logging

### Application Monitoring (PM2)

```bash
# Real-time monitoring
pm2 monit

# Process status
pm2 status

# Logs
pm2 logs myclinic --lines 100

# Restart on high memory
pm2 start ecosystem.config.js --max-memory-restart 500M
```

### Error Tracking (Sentry)

Automatic error tracking already configured. View errors at [sentry.io](https://sentry.io).

### Uptime Monitoring

**UptimeRobot** (free):
1. Create account at [uptimerobot.com](https://uptimerobot.com)
2. Add monitor: `https://myclinicsoft.com`
3. Set check interval: 5 minutes
4. Configure alerts (email, SMS)

### Database Monitoring (MongoDB Atlas)

1. Navigate to Atlas Dashboard
2. View Metrics:
   - Connections
   - Operations
   - Storage
   - CPU usage
3. Set Alerts:
   - Connections > 80%
   - Disk space > 80%
   - Slow queries

### Log Management

**Setup log rotation** (VPS):

```bash
# Create /etc/logrotate.d/myclinic
/var/www/clinic-management/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    missingok
    create 0640 www-data www-data
}
```

---

## Backup & Recovery

### Automated Daily Backups

Create backup script `scripts/backup.sh`:

```bash
#!/bin/bash

DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_DIR="/var/backups/myclinic"
DB_NAME="myclinic"

# Create backup directory
mkdir -p $BACKUP_DIR

# MongoDB backup
mongodump --uri="$MONGODB_URI" --out=$BACKUP_DIR/db_$DATE

# Compress
tar -czf $BACKUP_DIR/myclinic_$DATE.tar.gz $BACKUP_DIR/db_$DATE
rm -rf $BACKUP_DIR/db_$DATE

# Upload to S3 (optional)
# aws s3 cp $BACKUP_DIR/myclinic_$DATE.tar.gz s3://backups/

# Remove backups older than 30 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: myclinic_$DATE.tar.gz"
```

Make executable and add to cron:

```bash
chmod +x scripts/backup.sh

# Add to crontab (daily at 2 AM)
crontab -e
0 2 * * * /var/www/clinic-management/scripts/backup.sh
```

### MongoDB Atlas Backups

- **Continuous backup** (M10+ clusters)
- **Point-in-time recovery** (last 24 hours)
- **Snapshot schedule**: Daily, keep for 30 days

### Restore from Backup

```bash
# Extract backup
tar -xzf myclinic_2024-02-14.tar.gz

# Restore to MongoDB
mongorestore --uri="$MONGODB_URI" --drop db_2024-02-14/
```

---

## Scaling

### Horizontal Scaling (Multiple Instances)

**Vercel**: Auto-scales based on traffic

**Docker/VPS**: Use load balancer (Nginx)

```nginx
upstream myclinic_backend {
    least_conn;
    server 10.0.1.10:3000;
    server 10.0.1.11:3000;
    server 10.0.1.12:3000;
}

server {
    listen 443 ssl http2;
    server_name myclinicsoft.com;

    location / {
        proxy_pass http://myclinic_backend;
    }
}
```

### Database Scaling

**MongoDB Atlas**:
- Vertical: Upgrade cluster tier (M10 → M20 → M30)
- Horizontal: Enable sharding (for very large datasets)
- Read replicas: For read-heavy workloads

### CDN (Cloudflare)

Enable caching for static assets:
1. Cloudflare Dashboard → Caching
2. Caching Level: Standard
3. Browser Cache TTL: 4 hours
4. Page Rules:
   - `*.myclinicsoft.com/_next/static/*` → Cache Everything

---

## Troubleshooting

### Application Won't Start

```bash
# Check Node version
node --version  # Should be 18.17+

# Check port availability
sudo lsof -i :3000

# Check logs
pm2 logs myclinic --lines 50
```

### Database Connection Issues

```bash
# Test MongoDB connection
mongosh "$MONGODB_URI"

# Check network access in Atlas
# Verify IP whitelist includes your server IP

# Test with Node
node -e "require('mongoose').connect(process.env.MONGODB_URI).then(() => console.log('Connected')).catch(err => console.error(err))"
```

### 502 Bad Gateway (Nginx)

```bash
# Check if app is running
pm2 status

# Check Nginx configuration
sudo nginx -t

# Check Nginx logs
sudo tail -f /var/log/nginx/error.log

# Restart services
pm2 restart myclinic
sudo systemctl restart nginx
```

### High Memory Usage

```bash
# Check memory usage
free -h
pm2 list

# Restart with memory limit
pm2 restart myclinic --max-memory-restart 500M

# Check for memory leaks
node --inspect server.js
chrome://inspect
```

### Slow Performance

1. **Check database indexes**:
   ```javascript
   db.patients.getIndexes()
   ```

2. **Enable query profiling**:
   ```javascript
   db.setProfilingLevel(1, { slowms: 100 })
   db.system.profile.find().limit(5).sort({ ts: -1 })
   ```

3. **Monitor with PM2**:
   ```bash
   pm2 monit
   ```

4. **Check Vercel analytics** (if using Vercel)

### SSL Certificate Issues

```bash
# Test SSL
openssl s_client -connect myclinicsoft.com:443

# Renew Let's Encrypt
sudo certbot renew

# Check certificate expiry
sudo certbot certificates
```

---

## Post-Deployment Checklist

- [ ] Environment variables configured
- [ ] Database connected and indexed
- [ ] SSL certificate installed
- [ ] Custom domain configured
- [ ] Admin user created
- [ ] Default roles and permissions created
- [ ] Cloudinary configured
- [ ] Email sending working
- [ ] SMS sending working (if enabled)
- [ ] Backup script scheduled
- [ ] Monitoring enabled (Sentry, UptimeRobot)
- [ ] Error tracking working
- [ ] Log rotation configured
- [ ] Security headers enabled
- [ ] Rate limiting working
- [ ] Multi-tenant subdomains working
- [ ] WebSocket connections working
- [ ] File uploads working
- [ ] PDF generation working
- [ ] Production build tested
- [ ] Performance testing completed
- [ ] Security audit passed

---

## Rollback Procedure

If deployment fails:

**Vercel**:
```bash
# Rollback to previous deployment
vercel rollback
```

**PM2**:
```bash
# Checkout previous commit
git checkout <previous-commit-hash>
npm ci
npm run build
pm2 restart myclinic
```

**Database**:
```bash
# Restore from backup
mongorestore --uri="$MONGODB_URI" --drop <backup-directory>
```

---

## Support

**Documentation**: [docs/](../docs/)  
**Issues**: GitHub Issues  
**Email**: support@myclinicsoft.com

---

**Last Updated**: February 14, 2026  
**Version**: 1.0.0
