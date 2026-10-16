import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { HAS_ABNORMAL_EXPR, OUTSTANDING, WAIT_BUCKETS } from '@/lib/lab-results';

/**
 * GET /api/lab-results/insights[?mine=true]
 * What needs a clinician: results in but not reviewed (and how many are abnormal), orders
 * still out by how long they've waited, the tests ordered most, and typical turnaround.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'lab-results', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const now = new Date();
    const day = 86_400_000;
    const scope: Record<string, unknown> = { tenantId: tenantObjectId };
    if (request.nextUrl.searchParams.get('mine') === 'true') scope.orderedBy = new Types.ObjectId(session.userId);
    const from90 = new Date(now.getTime() - 90 * day);

    const [statusRows, abnormalToReview, waitRows, testRows, turnaround] = await Promise.all([
      LabResult.aggregate([{ $match: scope }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      LabResult.countDocuments({ ...scope, status: 'completed', $expr: HAS_ABNORMAL_EXPR }),
      LabResult.aggregate([
        { $match: { ...scope, status: { $in: OUTSTANDING } } },
        { $project: { days: { $floor: { $divide: [{ $subtract: [now, '$orderDate'] }, day] } } } },
        {
          $group: {
            _id: {
              $switch: {
                branches: WAIT_BUCKETS.filter((b) => b.max !== null).map((b) => ({ case: { $lte: ['$days', b.max as number] }, then: b.key })),
                default: WAIT_BUCKETS[WAIT_BUCKETS.length - 1].key,
              },
            },
            n: { $sum: 1 },
          },
        },
      ]),
      LabResult.aggregate([
        { $match: { ...scope, orderDate: { $gte: from90 }, status: { $ne: 'cancelled' }, 'request.testType': { $nin: [null, ''] } } },
        { $group: { _id: { $toLower: { $trim: { input: '$request.testType' } } }, name: { $first: { $trim: { input: '$request.testType' } } }, n: { $sum: 1 } } },
        { $sort: { n: -1, _id: 1 } },
        { $limit: 6 },
      ]),
      LabResult.aggregate([
        { $match: { ...scope, resultDate: { $gte: from90 }, orderDate: { $ne: null } } },
        { $project: { _id: 0, h: { $divide: [{ $subtract: ['$resultDate', '$orderDate'] }, 3_600_000] } } },
        { $match: { h: { $gte: 0 } } },
        { $sort: { h: 1 } },
        { $limit: 5000 },
      ]),
    ]);

    const hours = (turnaround as { h: number }[]).map((r) => r.h);
    const medianHours = hours.length ? (hours.length % 2 ? hours[(hours.length - 1) / 2] : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2) : null;
    const waitMap = new Map((waitRows as { _id: string; n: number }[]).map((r) => [r._id, r.n]));

    return NextResponse.json({
      success: true,
      data: {
        status: Object.fromEntries((statusRows as { _id: string; n: number }[]).map((r) => [r._id || 'ordered', r.n])),
        abnormalToReview,
        waiting: WAIT_BUCKETS.map((b) => ({ key: b.key, label: b.label, short: b.short, count: waitMap.get(b.key) || 0 })),
        tests: (testRows as { name: string; n: number }[]).map((r) => ({ name: r.name, count: r.n })),
        turnaround: { medianHours: medianHours === null ? null : Math.round(medianHours * 10) / 10, results: hours.length },
      },
    });
  } catch (error) {
    console.error('Error building lab insights:', error);
    return NextResponse.json({ success: false, error: 'Failed to load lab insights' }, { status: 500 });
  }
}
