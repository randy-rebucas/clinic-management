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
}

export async function loadVoucherOverview(now = new Date()): Promise<VoucherOverview> {
  await connectDB();
  const [batches, counts, activeAccounts, tenants] = await Promise.all([
    VoucherBatch.find({}).sort({ createdAt: -1 }).lean<any[]>(),
    ActivationCode.aggregate<{ _id: { batchId: Types.ObjectId; status: string }; n: number }>([
      { $group: { _id: { batchId: '$batchId', status: '$status' }, n: { $sum: 1 } } },
    ]),
    EmcrAccount.countDocuments({ 'activation.expiresAt': { $gt: now } }),
    Tenant.find({ status: 'active' }).select('name displayName').sort({ name: 1 }).lean<any[]>(),
  ]);

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
  };
}
