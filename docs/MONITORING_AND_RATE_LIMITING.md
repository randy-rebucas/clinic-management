# Monitoring and Rate Limiting Guide

This document describes the monitoring and rate limiting features implemented in the clinic management application.

## Table of Contents

1. [Application Monitoring (Sentry)](#application-monitoring-sentry)
2. [Health Check Endpoints](#health-check-endpoints)
3. [API Rate Limiting](#api-rate-limiting)
4. [Configuration](#configuration)

---

## Application Monitoring (Sentry)

### Overview

The application includes integrated Sentry monitoring for error tracking and performance monitoring. Sentry automatically captures exceptions, tracks performance, and provides detailed error reports.

### Setup

1. **Get Sentry DSN**
   - Sign up at [sentry.io](https://sentry.io)
   - Create a new project
   - Copy your DSN

2. **Configure Environment Variable**
   ```bash
   SENTRY_DSN=https://your-dsn@sentry.io/project-id
   ```

3. **Install Sentry Package** (Optional - dynamically imported)
   ```bash
   npm install @sentry/nextjs
   ```

### Features

- **Automatic Error Tracking**: All errors logged via `logger.error()` are automatically sent to Sentry
- **Performance Monitoring**: Transaction tracking for API routes
- **User Context**: User information is automatically attached to errors
- **Breadcrumbs**: Automatic breadcrumb tracking for debugging
- **Privacy**: Sensitive data (passwords, tokens, emails) is automatically filtered

### Usage

#### Automatic Error Tracking

Errors logged through the logger are automatically sent to Sentry:

```typescript
import logger from '@/lib/logger';

try {
  // Your code
} catch (error) {
  logger.error('Operation failed', error as Error, { context: 'additional info' });
  // Error is automatically sent to Sentry
}
```

#### Manual Error Reporting

```typescript
import { monitoring } from '@/lib/monitoring';

// Capture an exception
monitoring.captureException(error, { additionalContext: 'value' });

// Capture a message
monitoring.captureMessage('Something important happened', 'warning', { context: 'data' });

// Add breadcrumb
monitoring.addBreadcrumb('User action', 'user', 'info', { action: 'click' });

// Set user context
monitoring.setUser({ id: 'user123', username: 'john_doe' });
```

### Privacy and Security

- Sensitive headers (authorization, cookies) are automatically removed
- User emails are not included in production
- Query parameters with sensitive names are filtered
- All data is sanitized before sending to Sentry

---

## Health Check Endpoints

### Overview

The application provides comprehensive health check endpoints for monitoring and orchestration systems.

### Endpoints

#### 1. Full Health Check
**GET** `/api/health`

Returns comprehensive system status including:
- Database connection status
- Memory usage
- Service availability (SMS, Email, Cloudinary, etc.)
- System metrics
- Environment information

**Response Example:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "checks": {
    "database": {
      "status": "healthy",
      "connected": true,
      "responseTime": "15ms",
      "state": "connected"
    },
    "memory": {
      "status": "healthy",
      "heapUsed": "45MB",
      "heapTotal": "120MB",
      "rss": "180MB"
    },
    "services": {
      "mongodb": { "configured": true, "status": "available" },
      "sms": { "configured": true, "status": "available" },
      "email": { "configured": true, "status": "available" }
    }
  },
  "responseTime": "25ms",
  "version": "0.1.0"
}
```

#### 2. Liveness Probe
**GET** `/api/health/live`

Quick check to verify the service is running. Used by Kubernetes and container orchestration.

**Response:**
```json
{
  "status": "alive",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### 3. Readiness Probe
**GET** `/api/health/ready`

Detailed check to verify the service is ready to accept traffic. Checks required services (database, session secret).

**Response:**
```json
{
  "status": "ready",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "services": {
    "mongodb": true,
    "sessionSecret": true
  },
  "responseTime": "12ms"
}
```

### Kubernetes Integration

Use these endpoints in your Kubernetes deployment:

```yaml
livenessProbe:
  httpGet:
    path: /api/health/live
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /api/health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

---

## API Rate Limiting

### Overview

Rate limiting prevents abuse and ensures fair resource usage. The application includes configurable rate limiters for different use cases.

### Pre-configured Rate Limiters

#### 1. Authentication Rate Limiter
- **Window**: 15 minutes
- **Limit**: 5 requests
- **Use Case**: Login, password reset, authentication endpoints
- **Purpose**: Prevent brute force attacks

#### 2. Public API Rate Limiter
- **Window**: 1 minute
- **Limit**: 20 requests
- **Use Case**: Public endpoints (patient registration, public booking)
- **Purpose**: Prevent abuse of public endpoints

#### 3. Standard API Rate Limiter
- **Window**: 1 minute
- **Limit**: 100 requests
- **Use Case**: General API endpoints
- **Purpose**: Prevent API abuse

#### 4. Authenticated User Rate Limiter
- **Window**: 1 minute
- **Limit**: 200 requests
- **Use Case**: Authenticated API endpoints
- **Purpose**: Higher limits for authenticated users

### Usage

#### In API Routes

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.auth);
  if (rateLimitResponse) {
    return rateLimitResponse; // Returns 429 if limit exceeded
  }
  
  // Continue with your handler
  // ...
}
```

#### Custom Rate Limiter

```typescript
import { rateLimit } from '@/lib/middleware/rate-limit';

const customLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 50, // 50 requests per minute
  message: 'Custom rate limit exceeded',
});

export async function GET(request: NextRequest) {
  const rateLimitResponse = await customLimiter(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  // ...
}
```

### Rate Limit Headers

All rate-limited responses include standard headers:

- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: ISO timestamp when the limit resets
- `Retry-After`: Seconds until retry is allowed (on 429 responses)

### Rate Limit Response

When limit is exceeded, returns:

```json
{
  "success": false,
  "error": "Too many requests, please try again later",
  "retryAfter": 45
}
```

**Status Code**: `429 Too Many Requests`

### Client Identification

Rate limiting uses:
- IP address (from `X-Forwarded-For` or `X-Real-IP` headers)
- User agent
- Authentication status (authenticated users get higher limits)

### Storage

Currently uses in-memory storage (suitable for single-instance deployments).

**For multi-instance deployments**, consider using Redis:

```typescript
// Future: Redis-based rate limiting
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);
```

---

## Configuration

### Environment Variables

Add to `.env.local`:

```bash
# Sentry Monitoring (Optional)
SENTRY_DSN=https://your-dsn@sentry.io/project-id

# Rate Limiting (Optional - uses defaults if not set)
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### Disabling Features

#### Disable Monitoring
Simply don't set `SENTRY_DSN`. Monitoring will gracefully degrade.

#### Disable Rate Limiting
Rate limiting can be conditionally applied:

```typescript
if (process.env.RATE_LIMIT_ENABLED !== 'false') {
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.api);
  if (rateLimitResponse) return rateLimitResponse;
}
```

---

## Best Practices

### Monitoring

1. **Set up alerts** in Sentry for critical errors
2. **Review performance** regularly to identify bottlenecks
3. **Use breadcrumbs** to track user actions leading to errors
4. **Set user context** for better error attribution

### Health Checks

1. **Monitor regularly** using external monitoring services
2. **Set up alerts** for unhealthy status
3. **Use liveness/readiness** probes in containerized deployments
4. **Review metrics** to identify trends

### Rate Limiting

1. **Adjust limits** based on your application's needs
2. **Use stricter limits** for authentication endpoints
3. **Consider user tiers** (free vs. paid users)
4. **Monitor rate limit hits** to identify abuse patterns
5. **Use Redis** for multi-instance deployments

---

## Troubleshooting

### Monitoring Not Working

- Check that `SENTRY_DSN` is set correctly
- Verify Sentry package is installed: `npm install @sentry/nextjs`
- Check Sentry dashboard for project configuration
- Review server logs for initialization errors

### Health Check Failing

- Verify database connection string is correct
- Check that required environment variables are set
- Review database connection status
- Check system resources (memory, CPU)

### Rate Limiting Too Strict

- Adjust rate limit configuration
- Consider user authentication status
- Review rate limit headers in responses
- Check if IP address detection is working correctly

---

## Additional Resources

- [Sentry Documentation](https://docs.sentry.io/)
- [Next.js Monitoring](https://nextjs.org/docs/advanced-features/measuring-performance)
- [Rate Limiting Best Practices](https://cloud.google.com/architecture/rate-limiting-strategies-techniques)
