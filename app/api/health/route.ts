import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';

/**
 * Health check endpoint
 * Used by monitoring services and load balancers
 */
export async function GET() {
  const startTime = Date.now();
  
  try {
    // Check database connection
    await connectDB();
    const dbCheckTime = Date.now() - startTime;
    
    // Check environment variables
    const envStatus = {
      mongodb: !!process.env.MONGODB_URI,
      sessionSecret: !!process.env.SESSION_SECRET,
      encryptionKey: !!process.env.ENCRYPTION_KEY,
      sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      email: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
      cloudinary: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY),
    };
    
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        database: {
          connected: true,
          responseTime: `${dbCheckTime}ms`,
        },
        services: envStatus,
        responseTime: `${responseTime}ms`,
      },
      { status: 200 }
    );
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message || 'Unknown error',
        responseTime: `${responseTime}ms`,
      },
      { status: 503 }
    );
  }
}

