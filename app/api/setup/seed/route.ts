import { NextRequest, NextResponse } from 'next/server';
import { isSetupComplete } from '@/lib/setup';

/**
 * Run seed data script
 * Note: In serverless environments, we can't execute shell commands directly.
 * This endpoint provides instructions for running the seed script manually.
 * For local development, users should run: npm run seed
 */
export async function POST(request: NextRequest) {
  try {
    // Check if setup is complete first
    const setupComplete = await isSetupComplete();
    
    if (!setupComplete) {
      return NextResponse.json(
        { success: false, error: 'System setup must be completed before seeding data' },
        { status: 400 }
      );
    }

    // In serverless environments, we can't run shell commands
    // Return instructions instead
    return NextResponse.json({
      success: true,
      message: 'To seed the database, please run the following command in your terminal:',
      command: 'npm run seed',
      note: 'This must be run from your local development environment or server where you have shell access.',
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to process seed request',
      },
      { status: 500 }
    );
  }
}

