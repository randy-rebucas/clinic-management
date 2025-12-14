import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Settings from '@/models/Settings';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { clearSettingsCache, getDefaultSettings } from '@/lib/settings';
import { isSMSConfigured } from '@/lib/sms';
import { isEmailConfigured } from '@/lib/email';
import { isCloudinaryConfigured } from '@/lib/cloudinary';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

// GET settings - accessible to all authenticated users
export async function GET() {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Get or create default settings (tenant-scoped)
    const settingsQuery: any = {};
    if (tenantId) {
      settingsQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      settingsQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    let settings = await Settings.findOne(settingsQuery);

    if (!settings) {
      // Create default settings if none exist - use full default values
      const defaultSettingsData = getDefaultSettings();
      const settingsData: any = {
        ...defaultSettingsData,
      };
      if (tenantId) {
        settingsData.tenantId = new Types.ObjectId(tenantId);
      }
      settings = await Settings.create(settingsData);
    }

    // Merge with defaults to ensure all fields are present
    const defaultSettingsData = getDefaultSettings();
    const settingsObj = {
      ...defaultSettingsData,
      ...settings.toObject(),
    };
    
    // Add integration status based on environment variables
    settingsObj.integrationStatus = {
      twilio: isSMSConfigured(),
      smtp: isEmailConfigured(),
      cloudinary: isCloudinaryConfigured(),
    };

    return NextResponse.json(settingsObj, { status: 200 });
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
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const body = await request.json();

    // Get existing settings or create new (tenant-scoped)
    const settingsQuery: any = {};
    if (tenantId) {
      settingsQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      settingsQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    let settings = await Settings.findOne(settingsQuery);

    if (!settings) {
      // Merge with defaults when creating new settings
      const defaultSettingsData = getDefaultSettings();
      const settingsData: any = {
        ...defaultSettingsData,
        ...body,
      };
      if (tenantId && !settingsData.tenantId) {
        settingsData.tenantId = new Types.ObjectId(tenantId);
      }
      settings = await Settings.create(settingsData);
    } else {
      // Update settings - merge with defaults to ensure all fields exist
      const defaultSettingsData = getDefaultSettings();
      const updatedData = {
        ...defaultSettingsData,
        ...settings.toObject(),
        ...body,
      };
      Object.assign(settings, updatedData);
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

