import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * Readiness Probe
 * Detailed check to verify the service is ready to accept traffic
 * Used by Kubernetes and load balancers
 */
export async function GET() {
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
