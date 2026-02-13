# Production Readiness Checklist

## ✅ Completed Production Cleanup

### Files Removed (Old Polling System)
- ✅ `lib/hooks/useRealtime.ts` - Replaced by `useWebSocket.ts`
- ✅ `lib/hooks/useQueueRealtime.ts` - Replaced by `useQueueWebSocket.ts`
- ✅ `lib/hooks/useAppointmentRealtime.ts` - Replaced by `useAppointmentWebSocket.ts`
- ✅ `lib/hooks/useVisitRealtime.ts` - Replaced by `useVisitWebSocket.ts`
- ✅ `lib/realtimeHelpers.ts` - Replaced by `lib/websocket/emitHelper.ts`
- ✅ `components/examples/QueueRealtimeExample.tsx` - Demo file removed

### Documentation Archived
- ✅ Old polling docs moved to `docs/archive/`
- ✅ Current docs: `WEBSOCKET_QUICK_START.md`, `WEBSOCKET_SETUP_GUIDE.md`, `WEBSOCKET_MIGRATION_SUMMARY.md`

### Package.json Updated
- ✅ `npm run dev` now runs WebSocket server (default)
- ✅ `npm run dev:polling` available for fallback (old polling method)
- ✅ `npm start` runs production WebSocket server

---

## 🚀 Production Deployment Checklist

### 1. Environment Variables
- [ ] Copy `.env.example` to `.env.local` or `.env.production`
- [ ] Set `JWT_SECRET` to a strong random string
- [ ] Set `MONGODB_URI` to production database
- [ ] Set `NEXT_PUBLIC_APP_URL` to production domain
- [ ] Set `NODE_ENV=production`
- [ ] Configure email settings (SMTP)
- [ ] Configure SMS settings (Twilio)
- [ ] Configure Cloudinary (if using)
- [ ] Configure Sentry DSN (if using)

### 2. Database
- [ ] Run migrations if any
- [ ] Create production indexes
- [ ] Set up database backups
- [ ] Test connection from production server
- [ ] Seed initial data (specializations, roles, etc.)
- [ ] Create admin user: `npm run setup:admin`

### 3. Security
- [ ] Enable HTTPS/TLS
- [ ] Configure CORS properly
- [ ] Set secure cookie settings
- [ ] Enable rate limiting (API routes)
- [ ] Configure CSP headers
- [ ] Enable audit logging
- [ ] Set up firewall rules
- [ ] Configure DDoS protection

### 4. WebSocket Configuration
- [ ] Test WebSocket connections work through load balancer/proxy
- [ ] Configure sticky sessions if using multiple servers
- [ ] Set WebSocket timeout values
- [ ] Test auto-reconnection works
- [ ] Verify JWT authentication on WebSocket connections
- [ ] Test multi-tenancy room isolation

### 5. Performance
- [ ] Run `npm run build` successfully
- [ ] Test production build locally: `npm start`
- [ ] Enable gzip/brotli compression
- [ ] Configure CDN for static assets
- [ ] Set up database connection pooling
- [ ] Configure caching headers
- [ ] Test with production data volume

### 6. Monitoring & Logging
- [ ] Set up application monitoring (Sentry, New Relic, etc.)
- [ ] Configure error tracking
- [ ] Set up uptime monitoring
- [ ] Configure log aggregation
- [ ] Set up alerts for critical errors
- [ ] Monitor WebSocket connection count
- [ ] Track API response times

### 7. Testing
- [ ] Run all unit tests: `npm test`
- [ ] Test user authentication flows
- [ ] Test WebSocket real-time updates
- [ ] Test queue → appointment → visit flow
- [ ] Test with multiple concurrent users
- [ ] Test mobile responsiveness
- [ ] Test browser compatibility
- [ ] Load test with expected user count

### 8. Documentation
- [ ] Update README with production setup
- [ ] Document deployment process
- [ ] Document environment variables
- [ ] Create runbook for common issues
- [ ] Document backup/restore procedures
- [ ] Create user training materials

### 9. Backup & Recovery
- [ ] Set up automated database backups
- [ ] Test database restore procedure
- [ ] Set up file storage backups (Cloudinary)
- [ ] Document disaster recovery plan
- [ ] Create backup admin credentials

### 10. Pre-Launch
- [ ] Test all critical user flows end-to-end
- [ ] Verify email notifications work
- [ ] Verify SMS notifications work
- [ ] Test payment integration (if applicable)
- [ ] Verify PDF generation works
- [ ] Test QR code generation
- [ ] Verify medical certificate generation
- [ ] Test lab request printing

---

## 📋 Pre-Deployment Commands

```bash
# 1. Install dependencies
npm install

# 2. Run build to check for errors
npm run build

# 3. Test production build locally
npm start

# 4. Create admin user
npm run setup:admin

# 5. Seed required data
npm run seed:specializations
```

---

## 🔧 Production Server Requirements

### Minimum Server Specs
- **CPU:** 2 cores
- **RAM:** 4 GB
- **Storage:** 20 GB SSD
- **Network:** 100 Mbps

### Recommended Server Specs
- **CPU:** 4+ cores
- **RAM:** 8+ GB
- **Storage:** 50+ GB SSD
- **Network:** 1 Gbps

### Software Requirements
- **Node.js:** 20.x or higher
- **MongoDB:** 6.0 or higher
- **Nginx/Apache:** For reverse proxy (optional)
- **PM2/systemd:** For process management

---

## 🌐 Deployment Options

### Option 1: VPS (Recommended for WebSocket)
**Providers:** DigitalOcean, Linode, AWS EC2, Railway, Fly.io

**Steps:**
```bash
# Clone repository
git clone <repository-url>
cd clinic-management

# Install dependencies
npm install

# Build application
npm run build

# Set up environment variables
cp .env.example .env.production
nano .env.production

# Start with PM2
pm2 start npm --name "myclinicsoft" -- start
pm2 save
pm2 startup
```

### Option 2: Vercel (Without WebSocket)
**Note:** Vercel doesn't support WebSocket servers. Use external WebSocket service or polling fallback.

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod

# Set environment variables in Vercel dashboard
```

**For WebSocket on Vercel:**
- Deploy WebSocket server separately (Railway, Fly.io)
- Update `lib/hooks/useWebSocket.ts` to connect to external WS URL
- OR use polling fallback: `npm run dev:polling`

### Option 3: Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t myclinicsoft .
docker run -p 3000:3000 --env-file .env.production myclinicsoft
```

---

## ⚡ Performance Optimization

### 1. Database Indexes
Ensure these indexes exist:
```javascript
// Patients
db.patients.createIndex({ patientCode: 1 }, { unique: true });
db.patients.createIndex({ email: 1 });
db.patients.createIndex({ phone: 1 });
db.patients.createIndex({ tenantIds: 1 });

// Appointments
db.appointments.createIndex({ date: 1, doctor: 1 });
db.appointments.createIndex({ patient: 1 });
db.appointments.createIndex({ status: 1 });

// Queue
db.queue.createIndex({ status: 1, queuedAt: 1 });
db.queue.createIndex({ patient: 1 });
db.queue.createIndex({ doctor: 1 });

// Visits
db.visits.createIndex({ date: 1 });
db.visits.createIndex({ patient: 1 });
db.visits.createIndex({ provider: 1 });
```

### 2. Caching Strategy
- Use Redis for session storage
- Cache frequently accessed data (doctors, specializations)
- Set proper cache headers for static assets

### 3. WebSocket Scaling
For > 10,000 concurrent connections:
```bash
npm install @socket.io/redis-adapter redis
```

Update `server.ts`:
```typescript
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: 'redis://localhost:6379' });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));
```

---

## 🔍 Health Checks

### Application Health Endpoint
Create `app/api/health/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';

export async function GET() {
  try {
    await connectDB();
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      websocket: (global as any).io ? 'running' : 'not initialized',
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error.message,
      },
      { status: 503 }
    );
  }
}
```

### Monitoring Endpoints
- `/api/health` - Application health
- `/api/metrics` - Performance metrics (optional)

---

## 🚨 Common Production Issues

### Issue 1: WebSocket Connection Failed
**Symptoms:** "Connecting..." badge stuck yellow

**Solutions:**
1. Check firewall allows WebSocket connections
2. Configure nginx/Apache for WebSocket proxying:
```nginx
location /api/socket {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

### Issue 2: High Memory Usage
**Symptoms:** Server crashes, OOM errors

**Solutions:**
1. Increase server RAM
2. Set Node memory limit: `NODE_OPTIONS=--max-old-space-size=4096`
3. Implement connection pooling
4. Add Redis adapter for WebSocket

### Issue 3: Slow Database Queries
**Symptoms:** Slow page loads, timeouts

**Solutions:**
1. Add missing indexes
2. Use `.lean()` for read-only queries
3. Implement query caching
4. Use pagination for large datasets

---

## ✅ Launch Verification

After deployment, verify:
- [ ] Application loads on production URL
- [ ] Login works correctly
- [ ] WebSocket connects (green "Live" badge)
- [ ] Real-time updates work across tabs
- [ ] Queue → Appointment sync works
- [ ] Visit creation flow works
- [ ] Prescriptions generate correctly
- [ ] Invoices generate correctly
- [ ] PDF downloads work
- [ ] Emails send correctly
- [ ] SMS sends correctly (if configured)
- [ ] Medical certificates print
- [ ] Lab requests print
- [ ] QR codes scan correctly

---

## 🎉 Production Ready!

Once all checklist items are complete, your MyClinicSoft application is production-ready!

### Support Resources
- **Documentation:** `/docs` folder
- **WebSocket Guide:** `docs/WEBSOCKET_QUICK_START.md`
- **Setup Guide:** `docs/WEBSOCKET_SETUP_GUIDE.md`

### Maintenance Schedule
- **Daily:** Check error logs, monitor uptime
- **Weekly:** Review performance metrics, check disk space
- **Monthly:** Database backup verification, security updates
- **Quarterly:** Load testing, disaster recovery drill

---

Last Updated: February 13, 2026
Version: 1.0.0 Production
