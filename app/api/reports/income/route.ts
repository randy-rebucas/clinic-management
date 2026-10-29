import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { formatInTz } from '@/lib/tz';
import { openReport, dayKeys } from '../_lib/report-range';

/**
 * GET /api/reports/income?period=|startDate=&endDate=
 * Money in the window, on two clocks: collected = payments received in the window (whatever
 * invoice they paid), billed = invoices raised in the window. Refunded invoices count in neither;
 * they are reported apart. Aggregations only.
 */
export async function GET(request: NextRequest) {
  const open = await openReport(request, 'income');
  if (open instanceof NextResponse) return open;
  const { tenantObjectId, tz, start, end } = open;

  try {
    await connectDB();
    const scope = { tenantId: tenantObjectId };
    const billedMatch = { ...scope, createdAt: { $gte: start, $lte: end } };
    const day = (field: string) => ({ $dateToString: { format: '%Y-%m-%d', date: field, timezone: tz } });

    const [billedFacet, collectedFacet] = await Promise.all([
      Invoice.aggregate([
        { $match: billedMatch },
        {
          $facet: {
            totals: [
              { $match: { status: { $ne: 'refunded' } } },
              {
                $group: {
                  _id: null,
                  billed: { $sum: { $ifNull: ['$total', 0] } },
                  count: { $sum: 1 },
                  stillOwed: { $sum: { $cond: [{ $in: ['$status', ['unpaid', 'partial']] }, { $ifNull: ['$outstandingBalance', 0] }, 0] } },
                  discounts: { $sum: { $sum: { $ifNull: ['$discounts.amount', []] } } },
                  tax: { $sum: { $ifNull: ['$tax', 0] } },
                  professionalFees: { $sum: { $ifNull: ['$professionalFee', 0] } },
                },
              },
            ],
            refunded: [{ $match: { status: 'refunded' } }, { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: { $ifNull: ['$totalPaid', 0] } } } }],
            byDay: [{ $match: { status: { $ne: 'refunded' } } }, { $group: { _id: day('$createdAt'), v: { $sum: { $ifNull: ['$total', 0] } } } }],
            byCategory: [
              { $match: { status: { $ne: 'refunded' } } },
              { $unwind: '$items' },
              { $group: { _id: { $ifNull: ['$items.category', 'other'] }, v: { $sum: { $ifNull: ['$items.total', 0] } } } },
            ],
          },
        },
      ]),
      Invoice.aggregate([
        { $match: { ...scope, status: { $ne: 'refunded' }, 'payments.date': { $gte: start, $lte: end } } },
        { $unwind: '$payments' },
        { $match: { 'payments.date': { $gte: start, $lte: end } } },
        {
          $facet: {
            total: [{ $group: { _id: null, v: { $sum: '$payments.amount' }, n: { $sum: 1 } } }],
            byDay: [{ $group: { _id: day('$payments.date'), v: { $sum: '$payments.amount' } } }],
            byMethod: [{ $group: { _id: { $ifNull: ['$payments.method', 'unknown'] }, v: { $sum: '$payments.amount' } } }],
          },
        },
      ]),
    ]);

    const b = billedFacet[0];
    const c = collectedFacet[0];
    const round = (v: number) => Math.round((v || 0) * 100) / 100;
    const map = (rows: { _id: string; v: number }[]) => Object.fromEntries(rows.map((r) => [r._id, round(r.v)]));
    const billedByDay = new Map((b.byDay as { _id: string; v: number }[]).map((r) => [r._id, r.v]));
    const collectedByDay = new Map((c.byDay as { _id: string; v: number }[]).map((r) => [r._id, r.v]));
    const t = b.totals[0] ?? {};

    return NextResponse.json({
      success: true,
      data: {
        range: { start: start.toISOString(), end: end.toISOString() },
        today: formatInTz(new Date(), 'yyyy-MM-dd', tz),
        collected: round(c.total[0]?.v ?? 0),
        payments: c.total[0]?.n ?? 0,
        billed: round(t.billed ?? 0),
        invoices: t.count ?? 0,
        stillOwed: round(t.stillOwed ?? 0),
        discounts: round(t.discounts ?? 0),
        tax: round(t.tax ?? 0),
        professionalFees: round(t.professionalFees ?? 0),
        refunded: { count: b.refunded[0]?.count ?? 0, amount: round(b.refunded[0]?.amount ?? 0) },
        days: dayKeys(start, end, tz).map((date) => ({ date, collected: round(collectedByDay.get(date) ?? 0), billed: round(billedByDay.get(date) ?? 0) })),
        byMethod: map(c.byMethod),
        byCategory: map(b.byCategory),
      },
    });
  } catch (error) {
    console.error('Error generating income report:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate the income report' }, { status: 500 });
  }
}
