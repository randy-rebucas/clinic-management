import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import VoucherBatch from '@/models/VoucherBatch';
import ActivationCode from '@/models/ActivationCode';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { createAuditLog } from '@/lib/audit';
import logger from '@/lib/logger';
import {
  ACTIVATION_DAYS,
  createBatchCodes,
  MAX_BATCH_QUANTITY,
} from '@/lib/emcr/activation';
import { getPlatformFees } from '@/lib/platform-config';
import { loadVoucherOverview, newBatchNumber } from '@/lib/emcr/vouchers';

const CreateSchema = z
  .object({
    tenantId: z.string().refine((v) => Types.ObjectId.isValid(v), 'Choose a clinic'),
    quantity: z.number().int().min(1).max(MAX_BATCH_QUANTITY),
    plan: z.enum(['basic', 'plus']).default('basic'),
    // Omitted: the prices set under Platform → Configuration.
    faceValue: z.number().min(0).max(100000).optional(),
    wholesalePrice: z.number().min(0).max(100000).optional(),
    days: z.number().int().min(1).max(3 * 366).default(ACTIVATION_DAYS),
    notes: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((b) => b.wholesalePrice === undefined || b.faceValue === undefined || b.wholesalePrice <= b.faceValue, {
    message: 'Wholesale price can’t be above the voucher price',
  });

/** GET /api/platform/vouchers: every batch, totals and per-clinic stock (platform admins). */
export async function GET() {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  return NextResponse.json({ success: true, data: await loadVoucherOverview() });
}

/**
 * POST /api/platform/vouchers
 * Body: { tenantId, quantity, plan?, faceValue?, wholesalePrice? (default: Platform → Configuration), days? (365), notes? }
 * Make a batch of voucher codes for a clinic. The batch starts unpaid: its codes can be printed
 * but not redeemed until the cash is received (PATCH …/[id] { action: 'mark_paid' }).
 */
export async function POST(request: NextRequest) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const parsed = await parseBody(request, CreateSchema);
  if (isValidationError(parsed)) return parsed;
  const fees = await getPlatformFees();
  const body = {
    ...parsed.data,
    faceValue: parsed.data.faceValue ?? fees.voucherFaceValue,
    wholesalePrice: parsed.data.wholesalePrice ?? fees.voucherWholesalePrice,
  };
  if (body.wholesalePrice > body.faceValue) {
    return NextResponse.json({ success: false, error: 'Wholesale price can’t be above the voucher price' }, { status: 400 });
  }

  try {
    await connectDB();
    const tenant = await Tenant.findById(body.tenantId).select('name displayName status').lean<{ _id: Types.ObjectId; name?: string; displayName?: string; status?: string } | null>();
    if (!tenant) return NextResponse.json({ success: false, error: 'Clinic not found' }, { status: 404 });

    let batch: any = null;
    for (let attempt = 0; attempt < 5 && !batch; attempt++) {
      try {
        batch = await VoucherBatch.create({
          batchNumber: newBatchNumber(),
          tenantId: tenant._id,
          clinicName: tenant.displayName || tenant.name || 'Clinic',
          plan: body.plan,
          quantity: body.quantity,
          days: body.days,
          faceValue: body.faceValue,
          wholesalePrice: body.wholesalePrice,
          status: 'unpaid',
          notes: body.notes,
          createdBy: admin.email,
        });
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
      }
    }
    if (!batch) throw new Error('Could not allocate a batch number');

    try {
      await createBatchCodes(batch);
    } catch (error) {
      await ActivationCode.deleteMany({ batchId: batch._id });
      await VoucherBatch.deleteOne({ _id: batch._id });
      throw error;
    }

    await createAuditLog({
      userEmail: admin.email,
      userRole: 'platform-admin',
      tenantId: String(tenant._id),
      action: 'create',
      resource: 'settings',
      resourceId: batch._id,
      description: `eMCR voucher batch ${batch.batchNumber}: ${body.quantity} × ₱${body.faceValue} (₱${body.wholesalePrice} wholesale), unpaid`,
      metadata: { platform: true, emcrVoucherBatch: String(batch._id) },
    });
    return NextResponse.json({ success: true, data: { id: String(batch._id), batchNumber: batch.batchNumber } }, { status: 201 });
  } catch (error) {
    logger.error('Error creating eMCR voucher batch', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to create the batch' }, { status: 500 });
  }
}
