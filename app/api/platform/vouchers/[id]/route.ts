import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import VoucherBatch from '@/models/VoucherBatch';
import ActivationCode from '@/models/ActivationCode';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { createAuditLog } from '@/lib/audit';
import logger from '@/lib/logger';
import { normalizeActivationCode, hashActivationCode, readBatchCodes } from '@/lib/emcr/activation';

const PatchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('mark_paid'),
    /** Official receipt number or deposit reference. */
    paymentRef: z.string().trim().min(1).max(100),
    amountReceived: z.number().min(0).max(10_000_000),
    notes: z.string().trim().max(500).optional(),
  }),
  z.object({ action: z.literal('void'), reason: z.string().trim().min(1).max(500) }),
  /** Void one lost or stolen voucher (as printed). */
  z.object({ action: z.literal('void_code'), code: z.string().trim().min(1).max(40), reason: z.string().trim().max(500).optional() }),
]);

/**
 * GET /api/platform/vouchers/[id]: the batch and its codes in clear, for printing the voucher
 * sheet. Reading codes is audited.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Batch');

  await connectDB();
  const batch = await VoucherBatch.findById(id).lean<any>();
  if (!batch) return notFound('Batch');
  const codes = await readBatchCodes(batch._id);
  await createAuditLog({
    userEmail: admin.email,
    userRole: 'platform-admin',
    tenantId: String(batch.tenantId),
    action: 'print',
    resource: 'settings',
    resourceId: batch._id,
    description: `Viewed codes of eMCR voucher batch ${batch.batchNumber}`,
    metadata: { platform: true, emcrVoucherBatch: String(batch._id) },
  });
  return NextResponse.json({
    success: true,
    data: {
      batch: {
        id: String(batch._id),
        batchNumber: batch.batchNumber,
        clinicName: batch.clinicName,
        plan: batch.plan ?? 'basic',
        quantity: batch.quantity,
        days: batch.days,
        faceValue: batch.faceValue,
        wholesalePrice: batch.wholesalePrice,
        status: batch.status,
        paidAt: batch.paidAt ?? null,
        paymentRef: batch.paymentRef ?? null,
      },
      codes,
    },
  });
}

/**
 * PATCH /api/platform/vouchers/[id]
 * { action: 'mark_paid', paymentRef, amountReceived }: cash received; the codes go live.
 * { action: 'void', reason }: the whole batch stops working (unredeemed codes only).
 * { action: 'void_code', code, reason? }: one voucher stops working.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Batch');
  const parsed = await parseBody(request, PatchSchema);
  if (isValidationError(parsed)) return parsed;
  const body = parsed.data;

  try {
    await connectDB();
    const batch = await VoucherBatch.findById(id).lean<any>();
    if (!batch) return notFound('Batch');
    const now = new Date();
    let description: string;

    if (body.action === 'mark_paid') {
      const done = await VoucherBatch.updateOne(
        { _id: batch._id, status: 'unpaid' },
        {
          $set: {
            status: 'paid',
            paidAt: now,
            receivedBy: admin.email,
            paymentRef: body.paymentRef,
            amountReceived: body.amountReceived,
            ...(body.notes ? { notes: body.notes } : {}),
          },
        }
      );
      if (!done.modifiedCount) return NextResponse.json({ success: false, error: 'Only an unpaid batch can be marked paid.' }, { status: 409 });
      description = `eMCR voucher batch ${batch.batchNumber} paid: ₱${body.amountReceived} (ref ${body.paymentRef})`;
    } else if (body.action === 'void') {
      const done = await VoucherBatch.updateOne(
        { _id: batch._id, status: { $ne: 'void' } },
        { $set: { status: 'void', voidedAt: now, voidReason: body.reason } }
      );
      if (!done.modifiedCount) return NextResponse.json({ success: false, error: 'The batch is already void.' }, { status: 409 });
      await ActivationCode.updateMany({ batchId: batch._id, status: 'unsold' }, { $set: { status: 'void', voidedAt: now } });
      description = `eMCR voucher batch ${batch.batchNumber} voided: ${body.reason}`;
    } else {
      const code = normalizeActivationCode(body.code);
      if (!code) return NextResponse.json({ success: false, error: 'That doesn’t look like a voucher code.' }, { status: 400 });
      const done = await ActivationCode.updateOne(
        { codeHash: hashActivationCode(code), batchId: batch._id, status: 'unsold' },
        { $set: { status: 'void', voidedAt: now } }
      );
      if (!done.modifiedCount) {
        return NextResponse.json({ success: false, error: 'No unused code in this batch matches.' }, { status: 404 });
      }
      description = `eMCR voucher …${code.slice(-4)} of batch ${batch.batchNumber} voided${body.reason ? `: ${body.reason}` : ''}`;
    }

    await createAuditLog({
      userEmail: admin.email,
      userRole: 'platform-admin',
      tenantId: String(batch.tenantId),
      action: 'update',
      resource: 'settings',
      resourceId: new Types.ObjectId(String(batch._id)),
      description,
      metadata: { platform: true, emcrVoucherBatch: String(batch._id), action: body.action },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error updating eMCR voucher batch', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to update the batch' }, { status: 500 });
  }
}
