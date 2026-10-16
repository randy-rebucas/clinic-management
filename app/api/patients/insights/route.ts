import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { formatInTz, inTz } from '@/lib/tz';
import { subMonths, startOfMonth } from 'date-fns';
import { AGE_BANDS } from '@/lib/patient-age-bands';

/**
 * Clinic-wide patient roster insights for the patients page: registrations by month,
 * age bands, sex split, and the tags in use. Aggregation only; no records leave the DB.
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'patients', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const tz = await getTenantTimezone(tenantId);
    const now = new Date();
    const scope = { tenantIds: tenantObjectId };

    // Twelve clinic-local months ending with the current one.
    const firstMonth = new Date(startOfMonth(subMonths(inTz(now, tz), 11)).getTime());
    const monthKeys: string[] = [];
    for (let i = 11; i >= 0; i--) {
      monthKeys.push(formatInTz(subMonths(inTz(now, tz), i), 'yyyy-MM', tz));
    }

    // A birth date on or before this boundary means "at least N years old today".
    const bornBy = (years: number) => new Date(now.getFullYear() - years, now.getMonth(), now.getDate(), 23, 59, 59, 999);
    // $bucket boundaries must ascend: oldest birth dates first.
    const boundaries = [new Date(1800, 0, 1), ...[...AGE_BANDS].reverse().map((b) => new Date(bornBy(b.min).getTime() + 1))];
    // boundaries[i]..boundaries[i+1] covers bands from 66+ down to 0–12.

    const [counts, monthly, ages, sexes, tags] = await Promise.all([
      Patient.aggregate([
        { $match: scope },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$active', false] }, 0, 1] } },
          },
        },
      ]),
      Patient.aggregate([
        { $match: { ...scope, createdAt: { $gte: firstMonth } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: tz } }, v: { $sum: 1 } } },
      ]),
      Patient.aggregate([
        { $match: { ...scope, dateOfBirth: { $type: 'date' } } },
        {
          $bucket: {
            groupBy: '$dateOfBirth',
            boundaries,
            default: 'unknown',
            output: { v: { $sum: 1 } },
          },
        },
      ]),
      Patient.aggregate([{ $match: scope }, { $group: { _id: { $ifNull: ['$sex', 'unspecified'] }, v: { $sum: 1 } } }]),
      Patient.aggregate([
        { $match: { ...scope, tags: { $exists: true, $ne: [] } } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', v: { $sum: 1 } } },
        { $sort: { v: -1, _id: 1 } },
        { $limit: 30 },
      ]),
    ]);

    const monthMap = new Map(monthly.map((m: { _id: string; v: number }) => [m._id, m.v]));
    const reversedBands = [...AGE_BANDS].reverse();
    const ageMap = new Map<string, number>();
    for (const row of ages as { _id: Date | string; v: number }[]) {
      if (row._id === 'unknown') continue;
      const idx = boundaries.findIndex((b) => b.getTime() === new Date(row._id).getTime());
      const band = reversedBands[idx];
      if (band) ageMap.set(band.label, row.v);
    }

    const sexMap: Record<string, number> = {};
    for (const row of sexes as { _id: string; v: number }[]) {
      const key = ['male', 'female', 'other'].includes(row._id) ? row._id : 'unspecified';
      sexMap[key] = (sexMap[key] || 0) + row.v;
    }

    const total = counts[0]?.total ?? 0;
    const currentMonth = monthKeys[monthKeys.length - 1];

    return NextResponse.json({
      success: true,
      data: {
        total,
        active: counts[0]?.active ?? 0,
        newThisMonth: monthMap.get(currentMonth) ?? 0,
        months: monthKeys.map((month) => ({ month, registered: monthMap.get(month) ?? 0 })),
        ageBands: AGE_BANDS.map((b) => ({ ...b, count: ageMap.get(b.label) ?? 0 })),
        sex: sexMap,
        tags: (tags as { _id: string; v: number }[]).map((t) => ({ tag: t._id, count: t.v })),
      },
    });
  } catch (error) {
    console.error('Error building patient insights:', error);
    return NextResponse.json({ success: false, error: 'Failed to load patient insights' }, { status: 500 });
  }
}
