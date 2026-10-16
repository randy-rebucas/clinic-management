import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { formatInTz } from '@/lib/tz';
import { AGE_BANDS } from '@/lib/patient-age-bands';
import { openReport, dayKeys } from '../_lib/report-range';

/**
 * GET /api/reports/demographics?period=|startDate=&endDate=
 * The clinic's patients: registrations in the window (per day), and as of now their ages, sex,
 * home cities, what is on file (conditions, allergies, PhilHealth) and discount eligibility
 * (senior by flag or by age 60+, PWD, membership). Aggregations only; no records leave the DB.
 */
export async function GET(request: NextRequest) {
  const open = await openReport(request.nextUrl.searchParams, 'patients');
  if (open instanceof NextResponse) return open;
  const { tenantObjectId, tz, start, end } = open;

  try {
    await connectDB();
    const scope = { tenantIds: tenantObjectId };
    const now = new Date();
    const bornBy = (years: number) => new Date(now.getFullYear() - years, now.getMonth(), now.getDate(), 23, 59, 59, 999);
    // $bucket boundaries ascend: oldest birth dates first, so bands run 66+ down to 0–12.
    const boundaries = [new Date(1800, 0, 1), ...[...AGE_BANDS].reverse().map((b) => new Date(bornBy(b.min).getTime() + 1))];
    const nonEmpty = (field: string) => ({ $gt: [{ $size: { $ifNull: [field, []] } }, 0] });
    const has = (field: string) => ({ $and: [{ $ne: [{ $ifNull: [field, ''] }, ''] }] });

    const [result] = await Patient.aggregate([
      { $match: scope },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                withConditions: { $sum: { $cond: [nonEmpty('$preExistingConditions'), 1, 0] } },
                withAllergies: { $sum: { $cond: [nonEmpty('$allergies'), 1, 0] } },
                withPhilHealth: { $sum: { $cond: [has('$identifiers.philHealth'), 1, 0] } },
                senior: {
                  $sum: {
                    $cond: [{ $or: [{ $eq: ['$discountEligibility.senior.eligible', true] }, { $and: [{ $eq: [{ $type: '$dateOfBirth' }, 'date'] }, { $lte: ['$dateOfBirth', bornBy(60)] }] }] }, 1, 0],
                  },
                },
                pwd: { $sum: { $cond: [{ $eq: ['$discountEligibility.pwd.eligible', true] }, 1, 0] } },
                member: { $sum: { $cond: [{ $eq: ['$discountEligibility.membership.eligible', true] }, 1, 0] } },
              },
            },
          ],
          newByDay: [
            { $match: { createdAt: { $gte: start, $lte: end } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } }, n: { $sum: 1 } } },
          ],
          ages: [{ $match: { dateOfBirth: { $type: 'date' } } }, { $bucket: { groupBy: '$dateOfBirth', boundaries, default: 'unknown', output: { n: { $sum: 1 } } } }],
          sex: [{ $group: { _id: { $ifNull: ['$sex', 'unspecified'] }, n: { $sum: 1 } } }],
          cities: [
            { $match: { 'address.city': { $nin: [null, ''] } } },
            { $group: { _id: { $trim: { input: '$address.city' } }, n: { $sum: 1 } } },
            { $sort: { n: -1, _id: 1 } },
            { $limit: 8 },
          ],
        },
      },
    ]);

    const reversed = [...AGE_BANDS].reverse();
    const ageMap = new Map<string, number>();
    for (const row of result.ages as { _id: Date | string; n: number }[]) {
      if (row._id === 'unknown') continue;
      const band = reversed[boundaries.findIndex((b) => b.getTime() === new Date(row._id).getTime())];
      if (band) ageMap.set(band.label, row.n);
    }
    const sex: Record<string, number> = {};
    for (const r of result.sex as { _id: string; n: number }[]) {
      const k = ['male', 'female', 'other'].includes(r._id) ? r._id : 'unspecified';
      sex[k] = (sex[k] || 0) + r.n;
    }
    const perDay = new Map((result.newByDay as { _id: string; n: number }[]).map((r) => [r._id, r.n]));
    const days = dayKeys(start, end, tz).map((date) => ({ date, registered: perDay.get(date) ?? 0 }));
    const t = result.totals[0] ?? {};

    return NextResponse.json({
      success: true,
      data: {
        range: { start: start.toISOString(), end: end.toISOString() },
        today: formatInTz(now, 'yyyy-MM-dd', tz),
        total: t.total ?? 0,
        registered: days.reduce((s, d) => s + d.registered, 0),
        days,
        ages: AGE_BANDS.map((b) => ({ label: b.label, count: ageMap.get(b.label) ?? 0 })),
        sex,
        cities: (result.cities as { _id: string; n: number }[]).map((c) => ({ city: c._id, count: c.n })),
        onFile: { conditions: t.withConditions ?? 0, allergies: t.withAllergies ?? 0, philHealth: t.withPhilHealth ?? 0 },
        discounts: { senior: t.senior ?? 0, pwd: t.pwd ?? 0, membership: t.member ?? 0 },
      },
    });
  } catch (error) {
    console.error('Error generating patients report:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate the patients report' }, { status: 500 });
  }
}
