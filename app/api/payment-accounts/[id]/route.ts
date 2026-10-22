import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import PaymentAccount from '@/models/PaymentAccount';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { accountInputSchema } from '@/lib/payments/account-schema';
import { accountView, applyAccountInput, canManage, newWebhookToken, setDefault } from '@/lib/payments/accounts';

const PatchSchema = accountInputSchema.omit({ provider: true, ownerType: true, doctorId: true }).extend({
  /** Issue a new webhook URL (the old one stops working). */
  rotateWebhookToken: z.boolean().optional(),
});

async function load(id: string, tenantId: Types.ObjectId) {
  if (!Types.ObjectId.isValid(id)) return null;
  await connectDB();
  return PaymentAccount.findOne({ _id: new Types.ObjectId(id), tenantId }).select('+secretKeyEnc +webhookSecretEnc +manual.qrImage');
}

/** PATCH /api/payment-accounts/[id]: edit (blank secrets keep the stored ones), make default, enable. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { id } = await params;
  const acct = await load(id, ctx.tenantObjectId);
  if (!acct) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
  const scope = await canManage(ctx.session, ctx.tenantId, acct.ownerType, acct.doctorId ? String(acct.doctorId) : null);
  if (!scope.ok) return NextResponse.json({ success: false, error: scope.error }, { status: scope.status });

  const parsed = await parseBody(request, PatchSchema);
  if (isValidationError(parsed)) return parsed;
  const { rotateWebhookToken, ...input } = parsed.data;
  const problem = await applyAccountInput(acct, { ...input, provider: acct.provider, ownerType: acct.ownerType }, false);
  if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });
  if (input.isDefault) await setDefault(acct);
  if (rotateWebhookToken) acct.webhookToken = newWebhookToken();
  await acct.save();

  await createAuditLog({
    userId: ctx.session.userId,
    userEmail: ctx.session.email,
    userRole: ctx.session.role,
    tenantId: ctx.tenantId,
    action: 'update',
    resource: 'settings',
    resourceId: acct._id,
    description: `Updated payment account “${acct.label}”${input.secretKey ? ' (new key)' : ''}${rotateWebhookToken ? ' (new webhook URL)' : ''}`,
    metadata: { paymentAccount: String(acct._id) },
  });
  return NextResponse.json({ success: true, data: accountView(acct) });
}

/** DELETE /api/payment-accounts/[id]: remove the account and its keys. Past payments keep their record. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { id } = await params;
  const acct = await load(id, ctx.tenantObjectId);
  if (!acct) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
  const scope = await canManage(ctx.session, ctx.tenantId, acct.ownerType, acct.doctorId ? String(acct.doctorId) : null);
  if (!scope.ok) return NextResponse.json({ success: false, error: scope.error }, { status: scope.status });

  await PaymentAccount.deleteOne({ _id: acct._id, tenantId: ctx.tenantObjectId });
  await createAuditLog({
    userId: ctx.session.userId,
    userEmail: ctx.session.email,
    userRole: ctx.session.role,
    tenantId: ctx.tenantId,
    action: 'delete',
    resource: 'settings',
    resourceId: acct._id,
    description: `Removed payment account “${acct.label}” (${acct.provider})`,
  });
  return NextResponse.json({ success: true });
}
