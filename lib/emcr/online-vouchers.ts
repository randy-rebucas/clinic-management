import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import VoucherPurchase from '@/models/VoucherPurchase';
import ActivationCode from '@/models/ActivationCode';
import EmcrAccount from '@/models/EmcrAccount';
import { monthKeys, VOUCHER_MONTHS } from '@/lib/emcr/vouchers';

/**
 * Loaders for the platform console's online eMCR vouchers (bought at /voucher through PayMongo).
 * Codes stay encrypted here: revealing one is its own audited call. Every value is plain JSON.
 */

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
const DAY_MS = 86_400_000;

export type OnlineStatus = 'pending' | 'unused' | 'redeemed';

export interface OnlinePurchaseRow {
  id: string;
  email: string;
  amount: number;
  paidAmount: number | null;
  status: OnlineStatus;
  paymentId: string | null;
  createdAt: string;
  paidAt: string | null;
  emailedAt: string | null;
  last4: string | null;
  redeemedAt: string | null;
  /** Phone of the eMCR account that redeemed it, for the account lookup. */
  redeemedByPhone: string | null;
}

export interface OnlineVoucherSummary {
  revenue: number;
  sold: number;
  redeemed: number;
  unused: number;
  /** Checkouts started in the last 7 days and not paid (abandoned or in progress). */
  pendingRecent: number;
  byMonth: Array<{ month: string; revenue: number; sold: number }>;
}

/** Totals and per-month sales, for the Vouchers overview and the online page. */
export async function loadOnlineVoucherSummary(now = new Date()): Promise<OnlineVoucherSummary> {
  await connectDB();
  const months = monthKeys(now, VOUCHER_MONTHS);
  const [totals, byMonth, redeemed, pendingRecent] = await Promise.all([
    VoucherPurchase.aggregate<{ revenue: number; sold: number }>([
      { $match: { status: 'paid' } },
      { $group: { _id: null, revenue: { $sum: { $ifNull: ['$paidAmount', '$amount'] } }, sold: { $sum: 1 } } },
    ]),
    VoucherPurchase.aggregate<{ _id: string; revenue: number; sold: number }>([
      { $match: { status: 'paid', paidAt: { $gte: months.from } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$paidAt' } },
          revenue: { $sum: { $ifNull: ['$paidAmount', '$amount'] } },
          sold: { $sum: 1 },
        },
      },
    ]),
    ActivationCode.countDocuments({ purchaseId: { $exists: true }, status: 'redeemed' }),
    VoucherPurchase.countDocuments({ status: 'pending', createdAt: { $gte: new Date(now.getTime() - 7 * DAY_MS) } }),
  ]);
  const t = totals[0] ?? { revenue: 0, sold: 0 };
  const month = new Map(byMonth.map((m) => [m._id, m]));
  return {
    revenue: t.revenue,
    sold: t.sold,
    redeemed,
    unused: Math.max(0, t.sold - redeemed),
    pendingRecent,
    byMonth: months.keys.map((key) => ({ month: key, revenue: month.get(key)?.revenue ?? 0, sold: month.get(key)?.sold ?? 0 })),
  };
}

export const ONLINE_LIST_LIMIT = 200;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The newest purchases, filtered. `q` matches the buyer's email (start of it), a PayMongo
 * payment id, or a code's last 4 characters.
 */
export async function loadOnlinePurchases(opts: { q?: string; status?: OnlineStatus | '' } = {}): Promise<OnlinePurchaseRow[]> {
  await connectDB();
  const q = (opts.q ?? '').trim();
  const filter: Record<string, unknown> = {};
  if (opts.status === 'pending') filter.status = 'pending';
  else if (opts.status === 'unused' || opts.status === 'redeemed') {
    const ids = await ActivationCode.find({ purchaseId: { $exists: true }, status: opts.status === 'redeemed' ? 'redeemed' : 'unsold' })
      .select('purchaseId')
      .sort({ _id: -1 })
      .limit(5000)
      .lean<{ purchaseId: Types.ObjectId }[]>();
    filter._id = { $in: ids.map((r) => r.purchaseId) };
  }

  if (q) {
    const or: Record<string, unknown>[] = [{ email: { $regex: `^${escapeRegex(q.toLowerCase())}` } }];
    if (/^pay_[A-Za-z0-9]+$/.test(q)) or.push({ paymentId: q });
    const tail = q.toUpperCase().replace(/[\s-]/g, '');
    if (/^[A-Z0-9]{4}$/.test(tail)) {
      const byCode = await ActivationCode.find({ purchaseId: { $exists: true }, last4: tail }).select('purchaseId').limit(200).lean<{ purchaseId: Types.ObjectId }[]>();
      if (byCode.length) or.push({ _id: { $in: byCode.map((r) => r.purchaseId) } });
    }
    filter.$or = or;
  }

  const purchases = await VoucherPurchase.find(filter)
    .select('email amount paidAmount status paymentId createdAt paidAt emailedAt activationCodeId')
    .sort({ createdAt: -1 })
    .limit(ONLINE_LIST_LIMIT)
    .lean<any[]>();

  const codeIds = purchases.map((p) => p.activationCodeId).filter(Boolean);
  const codes = codeIds.length
    ? await ActivationCode.find({ _id: { $in: codeIds } }).select('last4 status redeemedAt redeemedBy').lean<any[]>()
    : [];
  const codeById = new Map(codes.map((c) => [String(c._id), c]));
  const accountIds = codes.map((c) => c.redeemedBy).filter(Boolean);
  const accounts = accountIds.length
    ? await EmcrAccount.find({ _id: { $in: accountIds } }).select('phone').lean<{ _id: Types.ObjectId; phone?: string }[]>()
    : [];
  const phoneById = new Map(accounts.map((a) => [String(a._id), a.phone ?? null]));

  return purchases.map((p) => {
    const code = p.activationCodeId ? codeById.get(String(p.activationCodeId)) : undefined;
    const status: OnlineStatus = p.status !== 'paid' ? 'pending' : code?.status === 'redeemed' ? 'redeemed' : 'unused';
    return {
      id: String(p._id),
      email: p.email,
      amount: p.amount,
      paidAmount: p.paidAmount ?? null,
      status,
      paymentId: p.paymentId ?? null,
      createdAt: iso(p.createdAt)!,
      paidAt: iso(p.paidAt),
      emailedAt: iso(p.emailedAt),
      last4: code?.last4 ?? null,
      redeemedAt: iso(code?.redeemedAt),
      redeemedByPhone: code?.redeemedBy ? phoneById.get(String(code.redeemedBy)) ?? null : null,
    };
  });
}
