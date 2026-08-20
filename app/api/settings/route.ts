import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { isSMSConfigured } from '@/lib/sms';
import { isEmailConfigured } from '@/lib/email';
import { isCloudinaryConfigured } from '@/lib/cloudinary';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getOrCreateSettings, updateSettings } from '@/lib/data/settings';
import { clearSettingsCache } from '@/lib/settings';

// GET settings - accessible to all authenticated users
export async function GET() {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const settingsObj = tenantId
      ? await runWithTenant(tenantId, () => getOrCreateSettings(tenantId))
      : await runAsSystem(() => getOrCreateSettings(null));

    // Add integration status based on environment variables
    (settingsObj as any).integrationStatus = {
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
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const body = await request.json();

    const settings = tenantId
      ? await runWithTenant(tenantId, () => updateSettings(tenantId, body))
      : await runAsSystem(() => updateSettings(null, body));

    // Clear lib/settings.ts's in-process cache so other callers (e.g.
    // lib/settings.ts's getSettings()) pick up the fresh values.
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
