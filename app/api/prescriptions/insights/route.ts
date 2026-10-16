import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { dayRangeOffsetInTz, formatInTz } from '@/lib/tz';

/**
 * GET /api/prescriptions/insights[?mine=true]
 * Prescriptions by status (all time), issued per day over 30 days, and the medicines
 * prescribed most often in the last 90 days. Aggregations only.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'prescriptions', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const tz = await getTenantTimezone(tenantId);
    const now = new Date();
    const scope: Record<string, unknown> = { tenantId: tenantObjectId };
    if (request.nextUrl.searchParams.get('mine') === 'true') scope.prescribedBy = new Types.ObjectId(session.userId);

    const from30 = dayRangeOffsetInTz(-29, now, tz).start;
    const from90 = dayRangeOffsetInTz(-89, now, tz).start;

    const [statusRows, dayRows, medRows] = await Promise.all([
      Prescription.aggregate([{ $match: scope }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Prescription.aggregate([
        { $match: { ...scope, issuedAt: { $gte: from30 }, status: { $ne: 'cancelled' } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$issuedAt', timezone: tz } }, n: { $sum: 1 } } },
      ]),
      Prescription.aggregate([
        { $match: { ...scope, issuedAt: { $gte: from90 }, status: { $ne: 'cancelled' } } },
        { $unwind: '$medications' },
        { $match: { 'medications.name': { $nin: [null, ''] } } },
        { $group: { _id: { $toLower: { $trim: { input: '$medications.name' } } }, name: { $first: { $trim: { input: '$medications.name' } } }, n: { $sum: 1 } } },
        { $sort: { n: -1, _id: 1 } },
        { $limit: 6 },
      ]),
    ]);

    const perDay = new Map(dayRows.map((r: { _id: string; n: number }) => [r._id, r.n]));
    const days: { date: string; issued: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const key = formatInTz(dayRangeOffsetInTz(-i, now, tz).start, 'yyyy-MM-dd', tz);
      days.push({ date: key, issued: perDay.get(key) || 0 });
    }

    return NextResponse.json({
      success: true,
      data: {
        today: formatInTz(now, 'yyyy-MM-dd', tz),
        status: Object.fromEntries(statusRows.map((r: { _id: string; n: number }) => [r._id || 'active', r.n])),
        days,
        medicines: medRows.map((r: { name: string; n: number }) => ({ name: r.name, count: r.n })),
      },
    });
  } catch (error) {
    console.error('Error building prescription insights:', error);
    return NextResponse.json({ success: false, error: 'Failed to load prescription insights' }, { status: 500 });
  }
}
