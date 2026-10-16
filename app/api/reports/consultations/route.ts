import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import User from '@/models/User';
import { formatInTz } from '@/lib/tz';
import { openReport, dayKeys } from '../_lib/report-range';

/**
 * GET /api/reports/consultations?period=|startDate=&endDate=
 * Visits in the window (cancelled ones counted apart): per day, by visit type, by doctor and by
 * status. Aggregations only.
 */
export async function GET(request: NextRequest) {
  const open = await openReport(request.nextUrl.searchParams, 'consultations');
  if (open instanceof NextResponse) return open;
  const { tenantObjectId, tz, start, end } = open;

  try {
    await connectDB();
    const window = { tenantId: tenantObjectId, date: { $gte: start, $lte: end } };
    const [result] = await Visit.aggregate([
      { $match: window },
      {
        $facet: {
          cancelled: [{ $match: { status: 'cancelled' } }, { $count: 'n' }],
          byDay: [
            { $match: { status: { $ne: 'cancelled' } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: tz } }, n: { $sum: 1 } } },
          ],
          byType: [{ $match: { status: { $ne: 'cancelled' } } }, { $group: { _id: { $ifNull: ['$visitType', 'consultation'] }, n: { $sum: 1 } } }],
          byStatus: [{ $match: { status: { $ne: 'cancelled' } } }, { $group: { _id: { $ifNull: ['$status', 'open'] }, n: { $sum: 1 } } }],
          byDoctor: [{ $match: { status: { $ne: 'cancelled' } } }, { $group: { _id: '$provider', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 12 }],
        },
      },
    ]);

    const toMap = (rows: { _id: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r._id, r.n]));
    const perDay = new Map((result.byDay as { _id: string; n: number }[]).map((r) => [r._id, r.n]));
    const days = dayKeys(start, end, tz).map((date) => ({ date, visits: perDay.get(date) ?? 0 }));

    const doctorIds = (result.byDoctor as { _id: unknown }[]).map((r) => r._id).filter(Boolean);
    const names = new Map(
      (await User.find({ _id: { $in: doctorIds }, tenantId: tenantObjectId }).select('name').lean()).map((u: { _id: unknown; name?: string }) => [String(u._id), u.name || 'Unnamed user'])
    );
    const byDoctor: Record<string, number> = {};
    for (const r of result.byDoctor as { _id: unknown; n: number }[]) {
      const name = r._id ? names.get(String(r._id)) ?? 'Former staff' : 'No doctor recorded';
      byDoctor[name] = (byDoctor[name] || 0) + r.n;
    }

    return NextResponse.json({
      success: true,
      data: {
        range: { start: start.toISOString(), end: end.toISOString() },
        today: formatInTz(new Date(), 'yyyy-MM-dd', tz),
        total: days.reduce((s, d) => s + d.visits, 0),
        cancelled: result.cancelled[0]?.n ?? 0,
        days,
        byType: toMap(result.byType),
        byStatus: toMap(result.byStatus),
        byDoctor,
      },
    });
  } catch (error) {
    console.error('Error generating consultations report:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate the consultations report' }, { status: 500 });
  }
}
