import 'server-only';
import { randomInt } from 'crypto';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import VoucherBatch from '@/models/VoucherBatch';
import ActivationCode from '@/models/ActivationCode';
import EmcrAccount from '@/models/EmcrAccount';
import Tenant from '@/models/Tenant';

/** Loaders for the platform console's eMCR voucher pages. Every value returned is plain JSON. */

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export function newBatchNumber(now = new Date()): string {
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `EV-${ymd}-${String(randomInt(0, 10000)).padStart(4, '0')}`;
}

export interface VoucherBatchRow {
  id: string;
  batchNumber: string;
  tenantId: string;
  clinicName: string;
  plan: 'basic' | 'plus';
  quantity: number;
  days: number;
  faceValue: number;
  wholesalePrice: number;
  status: 'unpaid' | 'paid' | 'void';
  redeemed: number;
  voided: number;
  amountDue: number;
  amountReceived: number | null;
  paidAt: string | null;
  paymentRef: string | null;
  receivedBy: string | null;
  voidReason: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface VoucherOverview {
  batches: VoucherBatchRow[];
  totals: {
    cashReceived: number;
    cashOutstanding: number;
    codesSold: number;
    codesRedeemed: number;
    unredeemedPaid: number;
    activeAccounts: number;
    /** Patients' spend at clinic counters (face value of codes redeemed). */
    patientSpend: number;
    /** Clinics' margin on redeemed codes (face value − wholesale). */
    clinicCommission: number;
  };
  byClinic: Array<{ tenantId: string; clinicName: string; paidCodes: number; redeemed: number; unredeemed: number; cashReceived: number; outstanding: number }>;
  clinics: Array<{ id: string; name: string }>;
  /** The last VOUCHER_MONTHS calendar months (UTC), oldest first. */
  byMonth: Array<{ month: string; cashReceived: number; redeemed: number }>;
  /** Unpaid batches: how many, and when the oldest was made. */
  unpaid: { batches: number; oldestAt: string | null };
  asOf: string;
}

export const VOUCHER_MONTHS = 12;

/** 'YYYY-MM' keys for the last n months (UTC), oldest first, and the first instant of the first. */
export function monthKeys(now: Date, n: number): { keys: string[]; from: Date } {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return { keys, from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1), 1)) };
}

export async function loadVoucherOverview(now = new Date()): Promise<VoucherOverview> {
  await connectDB();
  const months = monthKeys(now, VOUCHER_MONTHS);
  const [batches, codeAgg, activeAccounts, tenants] = await Promise.all([
    VoucherBatch.find({}).sort({ createdAt: -1 }).lean<any[]>(),
    // One pass over the codes: per-batch status counts, and redemptions by month.
    ActivationCode.aggregate<{
      byBatch: Array<{ _id: { batchId: Types.ObjectId; status: string }; n: number }>;
      byMonth: Array<{ _id: string; n: number }>;
    }>([
      {
        $facet: {
          byBatch: [{ $group: { _id: { batchId: '$batchId', status: '$status' }, n: { $sum: 1 } } }],
          byMonth: [
            { $match: { status: 'redeemed', redeemedAt: { $gte: months.from } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$redeemedAt' } }, n: { $sum: 1 } } },
          ],
        },
      },
    ]),
    EmcrAccount.countDocuments({ 'activation.expiresAt': { $gt: now } }),
    Tenant.find({ status: 'active' }).select('name displayName').sort({ name: 1 }).lean<any[]>(),
  ]);

  const counts = codeAgg[0]?.byBatch ?? [];
  const redeemedByMonth = new Map((codeAgg[0]?.byMonth ?? []).map((m) => [m._id, m.n]));
  const count = (batchId: unknown, status: string) =>
    counts.find((c) => String(c._id.batchId) === String(batchId) && c._id.status === status)?.n ?? 0;

  const rows: VoucherBatchRow[] = batches.map((b) => ({
    id: String(b._id),
    batchNumber: b.batchNumber,
    tenantId: String(b.tenantId),
    clinicName: b.clinicName,
    plan: b.plan ?? 'basic',
    quantity: b.quantity,
    days: b.days,
    faceValue: b.faceValue,
    wholesalePrice: b.wholesalePrice,
    status: b.status,
    redeemed: count(b._id, 'redeemed'),
    voided: count(b._id, 'void'),
    amountDue: b.quantity * b.wholesalePrice,
    amountReceived: b.amountReceived ?? null,
    paidAt: iso(b.paidAt),
    paymentRef: b.paymentRef ?? null,
    receivedBy: b.receivedBy ?? null,
    voidReason: b.voidReason ?? null,
    notes: b.notes ?? null,
    createdBy: b.createdBy,
    createdAt: iso(b.createdAt)!,
  }));

  // Money was received for a batch once it has a paidAt, even if it was voided later; codes
  // redeemed before a void stay redeemed.
  const wasPaid = (r: VoucherBatchRow) => !!r.paidAt;
  const received = (r: VoucherBatchRow) => r.amountReceived ?? r.amountDue;
  const live = (r: VoucherBatchRow) => (r.status === 'paid' ? r.quantity - r.voided - r.redeemed : 0);
  const paid = rows.filter(wasPaid);
  const byClinicMap = new Map<string, VoucherOverview['byClinic'][number]>();
  for (const r of rows) {
    if (r.status === 'void' && !r.paidAt) continue;
    const entry = byClinicMap.get(r.tenantId) ?? { tenantId: r.tenantId, clinicName: r.clinicName, paidCodes: 0, redeemed: 0, unredeemed: 0, cashReceived: 0, outstanding: 0 };
    if (wasPaid(r)) {
      entry.paidCodes += r.status === 'paid' ? r.quantity - r.voided : r.redeemed;
      entry.redeemed += r.redeemed;
      entry.unredeemed += live(r);
      entry.cashReceived += received(r);
    } else {
      entry.outstanding += r.amountDue;
    }
    byClinicMap.set(r.tenantId, entry);
  }

  return {
    // The table shows the latest 500; totals cover every batch.
    batches: rows.slice(0, 500),
    totals: {
      cashReceived: paid.reduce((s, r) => s + received(r), 0),
      cashOutstanding: rows.filter((r) => r.status === 'unpaid').reduce((s, r) => s + r.amountDue, 0),
      codesSold: paid.reduce((s, r) => s + (r.status === 'paid' ? r.quantity - r.voided : r.redeemed), 0),
      codesRedeemed: paid.reduce((s, r) => s + r.redeemed, 0),
      unredeemedPaid: paid.reduce((s, r) => s + live(r), 0),
      activeAccounts,
      patientSpend: paid.reduce((s, r) => s + r.redeemed * r.faceValue, 0),
      clinicCommission: paid.reduce((s, r) => s + r.redeemed * (r.faceValue - r.wholesalePrice), 0),
    },
    byClinic: [...byClinicMap.values()].sort((a, b) => a.clinicName.localeCompare(b.clinicName)),
    clinics: tenants.map((t) => ({ id: String(t._id), name: t.displayName || t.name })),
    byMonth: months.keys.map((month) => ({
      month,
      cashReceived: paid.filter((r) => r.paidAt!.slice(0, 7) === month).reduce((s, r) => s + received(r), 0),
      redeemed: redeemedByMonth.get(month) ?? 0,
    })),
    // rows are newest first, so the last unpaid one is the oldest.
    unpaid: (() => {
      const open = rows.filter((r) => r.status === 'unpaid');
      return { batches: open.length, oldestAt: open.at(-1)?.createdAt ?? null };
    })(),
    asOf: now.toISOString(),
  };
}
