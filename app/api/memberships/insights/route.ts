import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Membership from '@/models/Membership';
import Patient from '@/models/Patient';
import { getPermissionChecker, forbiddenResponse } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { membershipPermissions } from '@/lib/membership-access';
import { RENEWAL_DAYS } from '@/lib/memberships';

const DAY = 86_400_000;
const POINTS_WINDOW_DAYS = 30;

/**
 * GET /api/memberships/insights
 *
 * What the memberships page opens with, clinic-wide in one aggregation: members in date by tier,
 * renewals coming due (and memberships that have lapsed), and the points the programme owes:
 * the balance members hold, and what was added and used in the last 30 days.
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

  if (!membershipPermissions(await getPermissionChecker(session)).canRead) return forbiddenResponse('Cannot read memberships');

  try {
    await connectDB();
    const now = new Date();
    const horizon = new Date(now.getTime() + RENEWAL_DAYS * DAY);
    const since = new Date(now.getTime() - POINTS_WINDOW_DAYS * DAY);
    const inDate = { status: 'active', $or: [{ expiryDate: null }, { expiryDate: { $gte: now } }] };

    const [f] = await Membership.aggregate([
      { $match: { tenantId: tenantObjectId } },
      {
        $facet: {
          byTier: [{ $match: inDate }, { $group: { _id: '$tier', count: { $sum: 1 }, points: { $sum: '$points' } } }],
          byStatus: [
            {
              $group: {
                _id: {
                  $cond: [{ $and: [{ $eq: ['$status', 'active'] }, { $ne: [{ $ifNull: ['$expiryDate', null] }, null] }, { $lt: ['$expiryDate', now] }] }, 'expired', '$status'],
                },
                count: { $sum: 1 },
              },
            },
          ],
          due: [
            { $match: { status: 'active', expiryDate: { $gte: now, $lte: horizon } } },
            { $sort: { expiryDate: 1 } },
            { $group: { _id: null, count: { $sum: 1 }, next: { $push: { _id: '$_id', patient: '$patient', tier: '$tier', expiryDate: '$expiryDate' } } } },
            { $project: { count: 1, next: { $slice: ['$next', 4] } } },
          ],
          lapsedRecently: [
            { $match: { status: { $in: ['active', 'expired'] }, expiryDate: { $lt: now, $gte: new Date(now.getTime() - RENEWAL_DAYS * DAY) } } },
            { $count: 'n' },
          ],
          topBalances: [
            { $match: { ...inDate, points: { $gt: 0 } } },
            { $sort: { points: -1 } },
            { $limit: 3 },
            { $project: { patient: 1, points: 1, tier: 1 } },
          ],
          recent: [
            { $unwind: '$transactions' },
            { $match: { 'transactions.createdAt': { $gte: since } } },
            { $group: { _id: '$transactions.type', points: { $sum: '$transactions.points' }, entries: { $sum: 1 } } },
          ],
          joined: [{ $match: { joinDate: { $gte: since } } }, { $count: 'n' }],
        },
      },
    ]);

    const byTier = Object.fromEntries(f.byTier.map((r: { _id: string; count: number }) => [r._id, r.count]));
    const held = f.byTier.reduce((s: number, r: { points: number }) => s + (r.points || 0), 0);
    const byStatus = Object.fromEntries(f.byStatus.map((r: { _id: string; count: number }) => [r._id, r.count]));
    const recent = Object.fromEntries(f.recent.map((r: { _id: string; points: number; entries: number }) => [r._id, { points: r.points, entries: r.entries }]));
    const due = f.due[0] ?? { count: 0, next: [] };

    const ids = [...due.next.map((x: { patient: unknown }) => x.patient), ...f.topBalances.map((x: { patient: unknown }) => x.patient)].filter(Boolean);
    const people = ids.length
      ? await Patient.find({ _id: { $in: ids }, tenantIds: tenantObjectId }).select('firstName lastName').lean<{ _id: unknown; firstName: string; lastName: string }[]>()
      : [];
    const nameOf = new Map(people.map((p) => [String(p._id), `${p.firstName} ${p.lastName}`]));
    const named = (x: { _id: unknown; patient: unknown }) => ({ _id: String(x._id), name: nameOf.get(String(x.patient)) ?? 'Patient record unavailable' });

    return NextResponse.json({
      success: true,
      data: {
        inDate: Object.values(byTier).reduce((s: number, n) => s + (n as number), 0),
        byTier,
        byStatus,
        due: {
          count: due.count,
          next: due.next.map((x: { _id: unknown; patient: unknown; tier: string; expiryDate: Date }) => ({ ...named(x), tier: x.tier, expiryDate: x.expiryDate })),
        },
        lapsedRecently: f.lapsedRecently[0]?.n ?? 0,
        joinedRecently: f.joined[0]?.n ?? 0,
        points: {
          held,
          windowDays: POINTS_WINDOW_DAYS,
          earned: recent.earn?.points ?? 0,
          used: recent.redeem?.points ?? 0,
          corrections: recent.adjustment?.entries ?? 0,
          top: f.topBalances.map((x: { _id: unknown; patient: unknown; points: number; tier: string }) => ({ ...named(x), points: x.points, tier: x.tier })),
        },
      },
    });
  } catch (error) {
    console.error('Error building membership insights:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the membership figures' }, { status: 500 });
  }
}
