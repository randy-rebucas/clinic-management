import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Settings from '@/models/Settings';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { repVisitSettingsSchema, normalizeRepVisitSettings } from '@/lib/rep-visit-rules';

/** GET /api/rep-visits/settings — the clinic's rep visiting hours (admins). */
export async function GET() {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    if (!isAdmin(ctx.session)) return refuseAccess(ctx.session, 'Admin access required', 'medical-representatives');
    await connectDB();
    const doc = await Settings.findOne({ tenantId: ctx.tenantObjectId }).select('repVisitSettings').lean<any>();
    return NextResponse.json({ success: true, data: normalizeRepVisitSettings(doc?.repVisitSettings) });
  } catch (error) {
    console.error('Get rep visit settings error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load rep visiting hours' }, { status: 500 });
  }
}

/**
 * PUT /api/rep-visits/settings — save them (admins). Visits already approved stay as they are;
 * new requests follow the new hours.
 */
export async function PUT(request: NextRequest) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    if (!isAdmin(ctx.session)) return refuseAccess(ctx.session, 'Admin access required', 'medical-representatives', 'write');
    const parsed = await parseBody(request, repVisitSettingsSchema);
    if (isValidationError(parsed)) return parsed;
    if (parsed.data.enabled && !parsed.data.windows.length) {
      return NextResponse.json({ success: false, error: 'Add at least one visiting window before turning rep booking on.' }, { status: 400 });
    }

    await connectDB();
    // The Settings document normally exists (made at onboarding); upsert keeps this safe if not.
    await Settings.updateOne(
      { tenantId: ctx.tenantObjectId },
      { $set: { repVisitSettings: parsed.data }, $setOnInsert: { tenantId: ctx.tenantObjectId } },
      { upsert: true }
    );
    return NextResponse.json({ success: true, data: parsed.data, message: 'Rep visiting hours saved' });
  } catch (error) {
    console.error('Save rep visit settings error:', error);
    return NextResponse.json({ success: false, error: 'Failed to save rep visiting hours' }, { status: 500 });
  }
}
