import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import { isFeatureEnabled } from '@/lib/env-validation';
import { verifySession } from '@/app/lib/dal';
import { isAdmin } from '@/app/lib/auth-helpers';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';

const NO_CACHE = { 'Cache-Control': 'no-cache, no-store, must-revalidate' };

/**
 * Detailed health information (which integrations are configured, latency) is only
 * returned to monitoring with the cron bearer token or to a signed-in admin.
 * Anonymous callers get a bare status so the endpoint can't be used for reconnaissance.
 */
export async function canSeeHealthDetails(request: Request): Promise<boolean> {
  if (isAuthorizedCronRequest(request)) return true;
  try {
    const session = await verifySession();
    return isAdmin(session);
  } catch {
    return false;
  }
}

export function livenessResponse(extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { status: 'alive', timestamp: new Date().toISOString(), ...extra },
    { status: 200, headers: NO_CACHE }
  );
}

async function checkDatabase(): Promise<{ connected: boolean; failed: boolean; responseTimeMs: number }> {
  const start = Date.now();
  try {
    await connectDB();
    return { connected: mongoose.connection.readyState === 1, failed: false, responseTimeMs: Date.now() - start };
  } catch (error) {
    console.error('Health check: database connection failed', error);
    return { connected: false, failed: true, responseTimeMs: Date.now() - start };
  }
}

export async function readinessResponse(request: Request, extra: Record<string, unknown> = {}) {
  const startTime = Date.now();
  const db = await checkDatabase();
  const services = {
    mongodb: !!process.env.MONGODB_URI && db.connected,
    sessionSecret: !!process.env.SESSION_SECRET,
  };
  const allReady = Object.values(services).every(Boolean);
  const detailed = await canSeeHealthDetails(request);

  return NextResponse.json(
    {
      status: allReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      ...(detailed ? { services, responseTime: `${Date.now() - startTime}ms` } : {}),
      ...extra,
    },
    { status: allReady ? 200 : 503, headers: NO_CACHE }
  );
}

export async function fullHealthResponse(request: Request, extra: Record<string, unknown> = {}) {
  const startTime = Date.now();
  const db = await checkDatabase();
  const sessionConfigured = !!process.env.SESSION_SECRET;
  const allHealthy = db.connected && !!process.env.MONGODB_URI && sessionConfigured;
  const detailed = await canSeeHealthDetails(request);

  const body: Record<string, unknown> = {
    status: db.failed ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    ...extra,
  };

  if (detailed) {
    const flag = (configured: boolean) => ({ configured, status: configured ? 'available' : 'unavailable' });
    body.checks = {
      database: {
        status: db.connected ? 'healthy' : 'unhealthy',
        connected: db.connected,
        responseTime: `${db.responseTimeMs}ms`,
      },
      services: {
        mongodb: { configured: !!process.env.MONGODB_URI, status: db.connected ? 'available' : 'unavailable' },
        session: flag(sessionConfigured),
        encryption: flag(!!process.env.ENCRYPTION_KEY),
        sms: flag(isFeatureEnabled('sms')),
        email: flag(isFeatureEnabled('email')),
        cloudinary: flag(isFeatureEnabled('cloudinary')),
        monitoring: flag(!!process.env.SENTRY_DSN),
      },
      system: {
        uptime: `${Math.round(process.uptime())}s`,
        heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    };
    body.responseTime = `${Date.now() - startTime}ms`;
  }

  return NextResponse.json(body, { status: allHealthy ? 200 : 503, headers: NO_CACHE });
}
