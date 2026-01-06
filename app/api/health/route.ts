import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
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
    await connectDB();
    const dbTime = Date.now() - dbStart;
    checks.database = {
      status: 'healthy',
      connected: mongoose.connection.readyState === 1,
      responseTime: `${dbTime}ms`,
      state: getConnectionState(mongoose.connection.readyState),
    };
    
    // Database stats (if available)
    try {
      const dbStats = await mongoose.connection.db?.admin().serverStatus();
      if (dbStats) {
        checks.database.stats = {
          version: dbStats.version,
          uptime: dbStats.uptime,
          connections: dbStats.connections,
        };
      }
    } catch (err) {
      // Stats not critical, continue
    }
    
    // Memory usage
    const memoryUsage = process.memoryUsage();
    checks.memory = {
      status: 'healthy',
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
    };
    
    // Environment variables check
    checks.environment = {
      status: 'healthy',
      nodeEnv: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    };
    
    // Service availability
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
    
    // System metrics
    checks.system = {
      uptime: `${Math.round(process.uptime())}s`,
      cpuUsage: process.cpuUsage(),
      pid: process.pid,
    };
    
    // Overall status
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
    await connectDB();
    const dbConnected = mongoose.connection.readyState === 1;
    
    // Check required services
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

/**
 * Get human-readable connection state
 */
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

