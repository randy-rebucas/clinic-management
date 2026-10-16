import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { dayRangeOffsetInTz, formatInTz } from '@/lib/tz';

/**
 * GET /api/visits/insights[?mine=true]
 * The visits list at a glance: notes by status (all time), visits per day over the last
 * 30 days, and the most common diagnoses of the last 90 days. Aggregations only.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'visits', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const tz = await getTenantTimezone(tenantId);
    const now = new Date();
    const scope: Record<string, unknown> = { tenantId: tenantObjectId };
    if (request.nextUrl.searchParams.get('mine') === 'true') scope.provider = new Types.ObjectId(session.userId);

    const from30 = dayRangeOffsetInTz(-29, now, tz).start;
    const from90 = dayRangeOffsetInTz(-89, now, tz).start;

    const [statusRows, dayRows, dxRows] = await Promise.all([
      Visit.aggregate([{ $match: scope }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Visit.aggregate([
        { $match: { ...scope, date: { $gte: from30 }, status: { $ne: 'cancelled' } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: tz } }, n: { $sum: 1 } } },
      ]),
      Visit.aggregate([
        { $match: { ...scope, date: { $gte: from90 }, status: { $ne: 'cancelled' } } },
        { $unwind: '$diagnoses' },
        { $match: { 'diagnoses.code': { $nin: [null, ''] } } },
        { $group: { _id: '$diagnoses.code', description: { $first: '$diagnoses.description' }, n: { $sum: 1 } } },
        { $sort: { n: -1, _id: 1 } },
        { $limit: 6 },
      ]),
    ]);

    const perDay = new Map(dayRows.map((r: { _id: string; n: number }) => [r._id, r.n]));
    const days: { date: string; visits: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const key = formatInTz(dayRangeOffsetInTz(-i, now, tz).start, 'yyyy-MM-dd', tz);
      days.push({ date: key, visits: perDay.get(key) || 0 });
    }

    return NextResponse.json({
      success: true,
      data: {
        today: formatInTz(now, 'yyyy-MM-dd', tz),
        status: Object.fromEntries(statusRows.map((r: { _id: string; n: number }) => [r._id || 'open', r.n])),
        days,
        diagnoses: dxRows.map((r: { _id: string; description?: string; n: number }) => ({ code: r._id, description: r.description || '', count: r.n })),
      },
    });
  } catch (error) {
    console.error('Error building visit insights:', error);
    return NextResponse.json({ success: false, error: 'Failed to load visit insights' }, { status: 500 });
  }
}
