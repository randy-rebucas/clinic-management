import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { dayRangeOffsetInTz, formatInTz } from '@/lib/tz';
import { AGING, OPEN_STATUSES, agingRange } from '@/lib/invoices';

/**
 * GET /api/invoices/insights
 * What is still to collect (by days since billing), invoices by status (all time), and money
 * billed vs collected per day over 30 days. Aggregations only; refunded invoices are left out
 * of the money figures because their payments went back to the patient.
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'invoices', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const tz = await getTenantTimezone(tenantId);
    const now = new Date();
    const scope = { tenantId: tenantObjectId };
    const from30 = dayRangeOffsetInTz(-29, now, tz).start;

    const agingBranches = AGING.map((a) => {
      const r = agingRange(a.key, now);
      const conds: unknown[] = [];
      if (r.$lte) conds.push({ $lte: ['$createdAt', r.$lte] });
      if (r.$gt) conds.push({ $gt: ['$createdAt', r.$gt] });
      return { case: { $and: conds }, then: a.key };
    });

    const [openRows, statusRows, billedRows, collectedRows] = await Promise.all([
      Invoice.aggregate([
        { $match: { ...scope, status: { $in: OPEN_STATUSES } } },
        {
          $group: {
            _id: { $switch: { branches: agingBranches, default: '0-30' } },
            amount: { $sum: { $ifNull: ['$outstandingBalance', 0] } },
            n: { $sum: 1 },
          },
        },
      ]),
      Invoice.aggregate([{ $match: scope }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
      Invoice.aggregate([
        { $match: { ...scope, status: { $ne: 'refunded' }, createdAt: { $gte: from30 } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } },
            amount: { $sum: { $ifNull: ['$total', 0] } },
          },
        },
      ]),
      Invoice.aggregate([
        { $match: { ...scope, status: { $ne: 'refunded' }, 'payments.date': { $gte: from30 } } },
        { $unwind: '$payments' },
        { $match: { 'payments.date': { $gte: from30 } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$payments.date', timezone: tz } },
            amount: { $sum: { $ifNull: ['$payments.amount', 0] } },
          },
        },
      ]),
    ]);

    const round = (v: number) => Math.round(v * 100) / 100;
    const byBucket = new Map(openRows.map((r: { _id: string; amount: number; n: number }) => [r._id, r]));
    const aging = AGING.map((a) => ({ key: a.key, amount: round(byBucket.get(a.key)?.amount || 0), count: byBucket.get(a.key)?.n || 0 }));

    const billed = new Map(billedRows.map((r: { _id: string; amount: number }) => [r._id, r.amount]));
    const collected = new Map(collectedRows.map((r: { _id: string; amount: number }) => [r._id, r.amount]));
    const days: { date: string; billed: number; collected: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const key = formatInTz(dayRangeOffsetInTz(-i, now, tz).start, 'yyyy-MM-dd', tz);
      days.push({ date: key, billed: round(billed.get(key) || 0), collected: round(collected.get(key) || 0) });
    }

    return NextResponse.json({
      success: true,
      data: {
        today: formatInTz(now, 'yyyy-MM-dd', tz),
        open: {
          amount: round(aging.reduce((s, a) => s + a.amount, 0)),
          count: aging.reduce((s, a) => s + a.count, 0),
        },
        aging,
        status: Object.fromEntries(statusRows.map((r: { _id: string; n: number }) => [r._id || 'unpaid', r.n])),
        days,
      },
    });
  } catch (error) {
    console.error('Error building invoice insights:', error);
    return NextResponse.json({ success: false, error: 'Failed to load billing figures' }, { status: 500 });
  }
}
