import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { openReport } from '../_lib/report-range';

const CLAIM_STATUSES = ['pending', 'approved', 'rejected', 'paid'] as const;

/**
 * GET /api/reports/hmo-claims
 * Every invoice billed to an insurer or HMO, as it stands now. A claim with no status recorded
 * is pending (the invoice form starts claims as pending). The amount claimed is the covered
 * amount, or the invoice total when none was entered. Aggregations only.
 */
export async function GET(request: NextRequest) {
  const open = await openReport(request, 'hmo-claims');
  if (open instanceof NextResponse) return open;
  const { tenantObjectId } = open;

  try {
    await connectDB();
    const now = new Date();
    const status = { $ifNull: ['$insurance.status', 'pending'] };
    const amount = { $cond: [{ $gt: [{ $ifNull: ['$insurance.coverageAmount', 0] }, 0] }, '$insurance.coverageAmount', { $ifNull: ['$total', 0] }] };
    const ageDays = { $floor: { $divide: [{ $subtract: [now, '$createdAt'] }, 86_400_000] } };

    const [result] = await Invoice.aggregate([
      { $match: { tenantId: tenantObjectId, 'insurance.provider': { $nin: [null, ''] }, status: { $ne: 'refunded' } } },
      { $addFields: { claimStatus: status, claimAmount: amount, ageDays } },
      {
        $facet: {
          byStatus: [{ $group: { _id: '$claimStatus', n: { $sum: 1 }, amount: { $sum: '$claimAmount' } } }],
          byInsurer: [
            {
              $group: {
                _id: { $trim: { input: '$insurance.provider' } },
                claims: { $sum: 1 },
                amount: { $sum: '$claimAmount' },
                open: { $sum: { $cond: [{ $in: ['$claimStatus', ['pending', 'approved']] }, '$claimAmount', 0] } },
                rejected: { $sum: { $cond: [{ $eq: ['$claimStatus', 'rejected'] }, 1, 0] } },
                paid: { $sum: { $cond: [{ $eq: ['$claimStatus', 'paid'] }, '$claimAmount', 0] } },
              },
            },
            { $sort: { open: -1, amount: -1 } },
            { $limit: 20 },
          ],
          waiting: [{ $match: { claimStatus: 'pending' } }, { $group: { _id: null, avg: { $avg: '$ageDays' } } }],
          oldest: [
            { $match: { claimStatus: { $in: ['pending', 'approved'] } } },
            { $sort: { createdAt: 1 } },
            { $limit: 10 },
            { $lookup: { from: 'patients', localField: 'patient', foreignField: '_id', as: 'p', pipeline: [{ $match: { tenantIds: tenantObjectId } }, { $project: { firstName: 1, lastName: 1 } }] } },
            {
              $project: {
                invoiceNumber: 1,
                createdAt: 1,
                ageDays: 1,
                claimStatus: 1,
                claimAmount: 1,
                provider: '$insurance.provider',
                claimNumber: '$insurance.claimNumber',
                patient: { $first: '$p' },
              },
            },
          ],
        },
      },
    ]);

    const round = (v: number) => Math.round((v || 0) * 100) / 100;
    const st = new Map((result.byStatus as { _id: string; n: number; amount: number }[]).map((r) => [r._id, r]));

    return NextResponse.json({
      success: true,
      data: {
        status: Object.fromEntries(CLAIM_STATUSES.map((s) => [s, { count: st.get(s)?.n ?? 0, amount: round(st.get(s)?.amount ?? 0) }])),
        claims: [...st.values()].reduce((s, r) => s + r.n, 0),
        avgDaysPending: Math.round(result.waiting[0]?.avg ?? 0),
        byInsurer: (result.byInsurer as { _id: string; claims: number; amount: number; open: number; rejected: number; paid: number }[]).map((r) => ({
          insurer: r._id || 'Not named',
          claims: r.claims,
          amount: round(r.amount),
          open: round(r.open),
          paid: round(r.paid),
          rejected: r.rejected,
        })),
        oldest: result.oldest,
      },
    });
  } catch (error) {
    console.error('Error generating HMO claims report:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate the HMO claims report' }, { status: 500 });
  }
}
