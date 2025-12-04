import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { validateEnv } from '@/lib/env-validation';

/**
 * Check system prerequisites before setup
 * This endpoint checks environment variables and database connection
 */
export async function GET() {
  try {
    const checks = {
      environment: {
        mongodbUri: !!process.env.MONGODB_URI,
        sessionSecret: !!process.env.SESSION_SECRET,
        sessionSecretValid: process.env.SESSION_SECRET ? process.env.SESSION_SECRET.length >= 32 : false,
        mongodbUriValid: process.env.MONGODB_URI 
          ? (process.env.MONGODB_URI.startsWith('mongodb://') || process.env.MONGODB_URI.startsWith('mongodb+srv://'))
          : false,
      },
      database: {
        connected: false,
        error: null as string | null,
      },
      optional: {
        sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
        email: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
        cloudinary: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY),
      },
    };

    // Validate environment
    const envValidation = validateEnv();
    checks.environment = {
      ...checks.environment,
      ...envValidation,
    };

    // Test database connection
    try {
      await connectDB();
      checks.database.connected = true;
    } catch (error: any) {
      checks.database.connected = false;
      checks.database.error = error.message || 'Database connection failed';
    }

    // Determine if setup can proceed
    const canProceed = 
      checks.environment.mongodbUri &&
      checks.environment.sessionSecret &&
      checks.environment.sessionSecretValid &&
      checks.environment.mongodbUriValid &&
      checks.database.connected;

    return NextResponse.json({
      success: true,
      checks,
      canProceed,
      message: canProceed 
        ? 'All prerequisites met. You can proceed with setup.'
        : 'Please fix the issues above before proceeding.',
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to check system status',
      },
      { status: 500 }
    );
  }
}

