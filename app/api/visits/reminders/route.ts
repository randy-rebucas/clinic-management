import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { dayRangeInTz, dayRangeOffsetInTz } from '@/lib/tz';

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'visits', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const body = await request.json().catch(() => ({}));
    const visitId = body?.visitId;

    if (!isValidId(visitId)) {
      return NextResponse.json(
        { success: false, error: 'Visit ID required' },
        { status: 400 }
      );
    }

    const visit = await Visit.findOne(tenantFilter(ctx.tenantId, { _id: visitId }));
    if (!visit) return notFound('Visit');

    if (!visit.followUpDate) {
      return NextResponse.json(
        { success: false, error: 'No follow-up date set for this visit' },
        { status: 400 }
      );
    }

    // TODO: Implement actual email/SMS sending
    visit.followUpReminderSent = true;
    await visit.save();

    return NextResponse.json({
      success: true,
      message: 'Follow-up reminder sent successfully',
    });
  } catch (error: any) {
    console.error('Error sending reminder:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send reminder' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(ctx.session, 'visits', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const daysAhead = Math.min(Math.max(parseInt(searchParams.get('daysAhead') || '7') || 7, 0), 90);

    const tz = await getTenantTimezone(tenantId);
    const { start } = dayRangeInTz(new Date(), tz);
    const { end } = dayRangeOffsetInTz(daysAhead, new Date(), tz);

    const visitsNeedingReminders = await Visit.find(tenantFilter(tenantId, {
      followUpDate: { $gte: start, $lte: end },
      followUpReminderSent: { $ne: true },
      status: { $ne: 'cancelled' },
    }))
      .limit(500)
      .populate({ path: 'patient', select: 'firstName lastName email phone', match: { tenantIds: tenantObjectId } })
      .populate({ path: 'provider', select: 'name email', match: { tenantId: tenantObjectId } })
      .lean();

    return NextResponse.json({
      success: true,
      data: visitsNeedingReminders,
      count: visitsNeedingReminders.length,
    });
  } catch (error: any) {
    console.error('Error fetching reminders:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch reminders' },
      { status: 500 }
    );
  }
}
