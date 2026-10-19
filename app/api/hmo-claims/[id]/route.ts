import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import HmoClaimBatch from '@/models/HmoClaimBatch';
import Hmo from '@/models/Hmo';
import User from '@/models/User';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId, zShortText } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { closeBatch, recordRemittance, removeClaim, submitBatch } from '@/lib/hmo-claims';

/** GET: one transmittal with its claims, payments received and the HMO's terms. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Transmittal');

  try {
    await connectDB();
    const batch = await HmoClaimBatch.findOne({ _id: new Types.ObjectId(id), tenantId: ctx.tenantObjectId })
      .populate({ path: 'remittances.recordedBy', select: 'name', model: User })
      .populate({ path: 'createdBy', select: 'name', model: User })
      .lean<any>();
    if (!batch) return notFound('Transmittal');
    const hmo = await Hmo.findOne({ _id: batch.hmo, tenantId: ctx.tenantObjectId })
      .select('name email phone contactName paymentTermsDays withholdingServicesRate withholdingProfessionalRate')
      .lean();
    return NextResponse.json({ success: true, data: { ...batch, hmo } });
  } catch (error) {
    console.error('Error loading transmittal:', error);
    return NextResponse.json({ success: false, error: 'Failed to load the transmittal' }, { status: 500 });
  }
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('submit') }),
  z.object({ action: z.literal('close') }),
  z.object({ action: z.literal('remove'), invoice: zObjectId }),
  z.object({
    action: z.literal('remit'),
    date: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 86_400_000, 'A payment can’t be dated in the future'),
    reference: zShortText.optional(),
    form2307Received: z.boolean().default(false),
    notes: z.string().max(2000).optional(),
    lines: z
      .array(
        z.object({
          invoice: zObjectId,
          paid: z.number().finite().min(0).max(100_000_000),
          withheld: z.number().finite().min(0).max(100_000_000),
          denied: z.boolean().optional(),
          denialReason: z.string().max(500).optional(),
        })
      )
      .min(1)
      .max(500),
  }),
]);

/** PUT { action }: send a draft, take a claim out of it, record the HMO's payment, or close it. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Transmittal');
  const parsed = await parseBody(request, actionSchema);
  if (isValidationError(parsed)) return parsed;
  const body = parsed.data;

  try {
    await connectDB();
    const audit = (description: string) =>
      createAuditLog({
        userId: ctx.session.userId,
        userEmail: ctx.session.email,
        userRole: ctx.session.role,
        tenantId: ctx.tenantId,
        action: 'update',
        resource: 'hmo_claim',
        resourceId: id,
        description,
      });

    if (body.action === 'submit') {
      const r = await submitBatch(ctx.tenantId, id);
      if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
      await audit('Sent an HMO transmittal');
      return NextResponse.json({ success: true, data: { status: 'submitted' } });
    }
    if (body.action === 'close') {
      const r = await closeBatch(ctx.tenantId, id);
      if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
      await audit('Closed an HMO transmittal');
      return NextResponse.json({ success: true, data: { status: 'closed' } });
    }
    if (body.action === 'remove') {
      const r = await removeClaim(ctx.tenantId, id, body.invoice);
      if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
      await audit('Took a claim out of an HMO transmittal');
      return NextResponse.json({ success: true, data: { deleted: r.deleted } });
    }

    const r = await recordRemittance({
      tenantId: ctx.tenantId,
      batchId: id,
      userId: ctx.session.userId,
      date: body.date,
      reference: body.reference,
      form2307Received: body.form2307Received,
      notes: body.notes,
      lines: body.lines.map((l) => ({ invoiceId: l.invoice, paid: l.paid, withheld: l.withheld, denied: l.denied, denialReason: l.denialReason })),
    });
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });
    await audit(`Recorded an HMO payment on ${r.posted} claims${r.failed.length ? `; ${r.failed.length} not posted` : ''}`);
    return NextResponse.json({ success: true, data: r });
  } catch (error) {
    console.error('Error updating transmittal:', error);
    return NextResponse.json({ success: false, error: 'Failed to update the transmittal' }, { status: 500 });
  }
}
