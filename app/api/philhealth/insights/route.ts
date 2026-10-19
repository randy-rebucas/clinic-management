import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getSettings } from '@/lib/settings';
import { philhealthSettingsOf } from '@/lib/philhealth';
import { philhealthInsights } from '@/lib/philhealth-claims';

/** GET: the PhilHealth page's figures: to file by deadline, filed by days waiting, settled in 90 days. */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { filingDays } = philhealthSettingsOf((await getSettings(ctx.tenantId)).philhealthSettings);
    return NextResponse.json({ success: true, data: await philhealthInsights(ctx.tenantId, filingDays) });
  } catch (error) {
    console.error('Error loading PhilHealth figures:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the PhilHealth figures' }, { status: 500 });
  }
}
