import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isFeatureEnabled } from '@/lib/env-validation';

/**
 * Enhanced Health Check Endpoint
 * Provides comprehensive system status for monitoring services and load balancers
 *
 * Endpoints:
 * - GET /api/health - Full health check
 * - GET /api/health/live - Liveness probe (quick check)
 * - GET /api/health/ready - Readiness probe (detailed check)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Liveness probe - quick check if service is running
  if (path.endsWith('/live')) {
    return NextResponse.json(
      {
        status: 'alive',
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  }

  // Readiness probe - detailed system check
  if (path.endsWith('/ready')) {
    return await getReadinessCheck();
  }

  // Full health check (default)
  return await getFullHealthCheck();
}

/**
 * Full health check with all system metrics
 */
async function getFullHealthCheck() {
  const startTime = Date.now();
  const checks: Record<string, any> = {};

  try {
    // Database connection check
    const dbStart = Date.now();
    let dbConnected = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }
    const dbTime = Date.now() - dbStart;
    checks.database = {
      status: dbConnected ? 'healthy' : 'unhealthy',
      connected: dbConnected,
      responseTime: `${dbTime}ms`,
    };

    // Service availability — boolean flags only, no internal details
    checks.services = {
      database: {
        configured: !!process.env.DATABASE_URL,
        status: dbConnected ? 'available' : 'unavailable',
      },
      session: {
        configured: !!process.env.SESSION_SECRET,
        status: process.env.SESSION_SECRET ? 'available' : 'unavailable',
      },
      encryption: {
        configured: !!process.env.ENCRYPTION_KEY,
        status: process.env.ENCRYPTION_KEY ? 'available' : 'unavailable',
      },
      sms: {
        configured: isFeatureEnabled('sms'),
        status: isFeatureEnabled('sms') ? 'available' : 'unavailable',
      },
      email: {
        configured: isFeatureEnabled('email'),
        status: isFeatureEnabled('email') ? 'available' : 'unavailable',
      },
      cloudinary: {
        configured: isFeatureEnabled('cloudinary'),
        status: isFeatureEnabled('cloudinary') ? 'available' : 'unavailable',
      },
      monitoring: {
        configured: !!process.env.SENTRY_DSN,
        status: process.env.SENTRY_DSN ? 'available' : 'unavailable',
      },
    };

    const allHealthy =
      dbConnected &&
      checks.services.database.status === 'available' &&
      checks.services.session.status === 'available';

    const responseTime = Date.now() - startTime;

    return NextResponse.json(
      {
        status: allHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        checks,
        responseTime: `${responseTime}ms`,
      },
      {
        status: allHealthy ? 200 : 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    const responseTime = Date.now() - startTime;

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  }
}

/**
 * Readiness check - detailed system status
 */
async function getReadinessCheck() {
  const startTime = Date.now();

  try {
    // Check database connection
    let dbConnected = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    // Check required services
    const requiredServices = {
      database: !!process.env.DATABASE_URL && dbConnected,
      sessionSecret: !!process.env.SESSION_SECRET,
    };

    const allReady = Object.values(requiredServices).every(Boolean);
    const responseTime = Date.now() - startTime;

    return NextResponse.json(
      {
        status: allReady ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        services: requiredServices,
        responseTime: `${responseTime}ms`,
      },
      {
        status: allReady ? 200 : 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    const responseTime = Date.now() - startTime;

    return NextResponse.json(
      {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: error.message || 'Unknown error',
        responseTime: `${responseTime}ms`,
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  }
}
