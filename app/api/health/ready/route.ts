import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';

/**
 * Readiness Probe
 * Detailed check to verify the service is ready to accept traffic
 * Used by Kubernetes and load balancers
 */
export async function GET() {
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
