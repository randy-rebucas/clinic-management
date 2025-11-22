import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Settings from '@/models/Settings';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { clearSettingsCache } from '@/lib/settings';

// GET settings - accessible to all authenticated users
export async function GET() {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();

    // Get or create default settings
    let settings = await Settings.findOne();

    if (!settings) {
      // Create default settings if none exist
      settings = await Settings.create({});
    }

    return NextResponse.json(settings, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings', details: error.message },
      { status: 500 }
    );
  }
}

// PUT settings - only admins can update
export async function PUT(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admins can update settings
  if (session.role !== 'admin') {
    return NextResponse.json(
      { error: 'Unauthorized: Only admins can update settings' },
      { status: 403 }
    );
  }

  try {
    await connectDB();

    const body = await request.json();

    // Get existing settings or create new
    let settings = await Settings.findOne();

    if (!settings) {
      settings = await Settings.create(body);
    } else {
      // Update settings
      Object.assign(settings, body);
      await settings.save();
    }

    // Clear cache so next request gets fresh settings
    clearSettingsCache();

    return NextResponse.json(settings, { status: 200 });
  } catch (error: any) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings', details: error.message },
      { status: 500 }
    );
  }
}

