# Auto-Reminder Cron Job Setup

This guide explains how to set up automatic reminder sending using the cron job endpoint.

## Overview

The system includes a cron endpoint at `/api/cron/reminders` that automatically sends:
- Appointment reminders (24 hours before)
- Visit follow-up reminders (24 hours before)

## Setup Options

### Option 1: Vercel Cron (Recommended for Vercel Deployments)

If deploying to Vercel, add a `vercel.json` file:

```json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "0 9 * * *"
    }
  ]
}
```

This runs daily at 9 AM UTC. Adjust the schedule as needed using [cron syntax](https://crontab.guru/).

### Option 2: External Cron Service

Use services like:
- [cron-job.org](https://cron-job.org) (free)
- [EasyCron](https://www.easycron.com)
- [Cronitor](https://cronitor.io)

**Configuration:**
- **URL**: `https://your-domain.com/api/cron/reminders`
- **Method**: GET
- **Schedule**: Daily (e.g., 9:00 AM)
- **Headers**: `Authorization: Bearer YOUR_CRON_SECRET`

### Option 3: Server Cron (Linux/Mac)

Add to your server's crontab:

```bash
# Edit crontab
crontab -e

# Add this line (runs daily at 9 AM)
0 9 * * * curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-domain.com/api/cron/reminders
```

### Option 4: Node.js Cron Package

For self-hosted deployments, you can use `node-cron`:

```bash
npm install node-cron
```

Create a script `scripts/run-reminders.ts`:

```typescript
import cron from 'node-cron';
import fetch from 'node-fetch';

const CRON_SECRET = process.env.CRON_SECRET;
const API_URL = process.env.API_URL || 'http://localhost:3000';

cron.schedule('0 9 * * *', async () => {
  try {
    const res = await fetch(`${API_URL}/api/cron/reminders`, {
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
      },
    });
    const data = await res.json();
    console.log('Reminders processed:', data);
  } catch (error) {
    console.error('Error running reminders:', error);
  }
});
```

## Security

### Setting Up CRON_SECRET

1. Generate a secure secret:
   ```bash
   openssl rand -base64 32
   ```

2. Add to `.env.local`:
   ```env
   CRON_SECRET=your_generated_secret_here
   ```

3. Use this secret in your cron job configuration

### Authentication

The cron endpoint requires authentication via the `Authorization` header:

```
Authorization: Bearer YOUR_CRON_SECRET
```

If `CRON_SECRET` is not set, the endpoint will still work but won't require authentication (not recommended for production).

## Testing

Test the cron endpoint manually:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  http://localhost:3000/api/cron/reminders
```

Or use a tool like Postman with the Authorization header.

## Monitoring

- Check server logs for cron job execution
- Monitor Twilio console for SMS delivery
- Review appointment/visit records for `reminderSent` flags

## Schedule Recommendations

- **Daily at 9 AM**: Good for sending reminders for appointments the next day
- **Twice Daily (9 AM, 2 PM)**: For more frequent reminders
- **Custom**: Adjust based on your clinic's operating hours

Example schedules:
- `0 9 * * *` - Daily at 9:00 AM
- `0 9,14 * * *` - Daily at 9:00 AM and 2:00 PM
- `0 8 * * 1-5` - Weekdays at 8:00 AM

