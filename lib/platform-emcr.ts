import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import VoucherBatch from '@/models/VoucherBatch';
import ActivationCode from '@/models/ActivationCode';
import { createAuditLog } from '@/lib/audit';
import { readBatchCodes } from '@/lib/emcr/activation';
import type { VoucherBatchRow } from '@/lib/emcr/vouchers';

/** Loaders for the platform console's eMCR voucher batch pages. Every value returned is plain JSON. */

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export interface VoucherBatchDetail extends VoucherBatchRow {
  unsold: number;
  voidedAt: string | null;
}

/** One batch with its code counts (no codes). Null when the id is not a batch. */
export async function loadVoucherBatch(id: string): Promise<VoucherBatchDetail | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectDB();
  const b = await VoucherBatch.findById(id).lean<any>();
  if (!b) return null;
  const counts = await ActivationCode.aggregate<{ _id: string; n: number }>([
    { $match: { batchId: b._id } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const count = (status: string) => counts.find((c) => c._id === status)?.n ?? 0;
  return {
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
    redeemed: count('redeemed'),
    voided: count('void'),
    unsold: count('unsold'),
    amountDue: b.quantity * b.wholesalePrice,
    amountReceived: b.amountReceived ?? null,
    paidAt: iso(b.paidAt),
    paymentRef: b.paymentRef ?? null,
    receivedBy: b.receivedBy ?? null,
    voidReason: b.voidReason ?? null,
    voidedAt: iso(b.voidedAt),
    notes: b.notes ?? null,
    createdBy: b.createdBy,
    createdAt: iso(b.createdAt)!,
  };
}

/**
 * The batch and its codes in clear, for the printable voucher sheet. Reading codes is audited,
 * the same as GET /api/platform/vouchers/[id].
 */
export async function loadVoucherSheet(
  id: string,
  adminEmail: string
): Promise<{ batch: VoucherBatchDetail; codes: { code: string; status: string }[] } | null> {
  const batch = await loadVoucherBatch(id);
  if (!batch) return null;
  const batchId = new Types.ObjectId(batch.id);
  const codes = await readBatchCodes(batchId);
  await createAuditLog({
    userEmail: adminEmail,
    userRole: 'platform-admin',
    tenantId: batch.tenantId,
    action: 'print',
    resource: 'settings',
    resourceId: batchId,
    description: `Viewed codes of eMCR voucher batch ${batch.batchNumber}`,
    metadata: { platform: true, emcrVoucherBatch: batch.id },
  });
  return { batch, codes };
}
