import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import { isFeatureEnabled } from '@/lib/env-validation';

/**
 * API v1 Health Check Endpoint
 * Mirrors /api/health for versioned API
 *
 * Endpoints:
 * - GET /api/v1/health - Full health check
 * - GET /api/v1/health/live - Liveness probe
 * - GET /api/v1/health/ready - Readiness probe
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.endsWith('/live')) {
    return NextResponse.json(
      {
        status: 'alive',
        timestamp: new Date().toISOString(),
        apiVersion: 'v1',
      },
      { status: 200 }
    );
  }

  if (path.endsWith('/ready')) {
    return await getReadinessCheck();
  }

  return await getFullHealthCheck();
}

async function getFullHealthCheck() {
  const startTime = Date.now();
  const checks: Record<string, any> = {};
  try {
    const dbStart = Date.now();
    await connectDB();
    const dbTime = Date.now() - dbStart;
    checks.database = {
      status: 'healthy',
      connected: mongoose.connection.readyState === 1,
      responseTime: `${dbTime}ms`,
      state: getConnectionState(mongoose.connection.readyState),
    };
    try {
      const dbStats = await mongoose.connection.db?.admin().serverStatus();
      if (dbStats) {
        checks.database.stats = {
          version: dbStats.version,
          uptime: dbStats.uptime,
          connections: dbStats.connections,
        };
      }
    } catch {}
    const memoryUsage = process.memoryUsage();
    checks.memory = {
      status: 'healthy',
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
    };
    checks.environment = {
      status: 'healthy',
      nodeEnv: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    };
    checks.services = {
      mongodb: {
        configured: !!process.env.MONGODB_URI,
        status: checks.database.connected ? 'available' : 'unavailable',
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
    checks.system = {
      uptime: `${Math.round(process.uptime())}s`,
      cpuUsage: process.cpuUsage(),
      pid: process.pid,
    };
    const allHealthy =
      checks.database.connected &&
      checks.services.mongodb.status === 'available' &&
      checks.services.session.status === 'available';
    const responseTime = Date.now() - startTime;
    return NextResponse.json(
      {
        status: allHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        checks,
        responseTime: `${responseTime}ms`,
        version: process.env.npm_package_version || '0.1.0',
        apiVersion: 'v1',
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
        error: error.message || 'Unknown error',
        checks: {
          ...checks,
          error: {
            message: error.message,
            name: error.name,
          },
        },
        responseTime: `${responseTime}ms`,
        apiVersion: 'v1',
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

async function getReadinessCheck() {
  const startTime = Date.now();
  try {
    await connectDB();
    const dbConnected = mongoose.connection.readyState === 1;
    const requiredServices = {
      mongodb: !!process.env.MONGODB_URI && dbConnected,
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
        apiVersion: 'v1',
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
        apiVersion: 'v1',
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

function getConnectionState(state: number): string {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
    99: 'uninitialized',
  };
  return states[state as keyof typeof states] || 'unknown';
}
