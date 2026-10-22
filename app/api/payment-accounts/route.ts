import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import PaymentAccount, { isOnlineProvider } from '@/models/PaymentAccount';
import { isAdmin } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { myDoctorProfileId } from '@/lib/doctor-access';
import { accountInputSchema } from '@/lib/payments/account-schema';
import { accountView, applyAccountInput, canManage, listAccounts, newWebhookToken, setDefault } from '@/lib/payments/accounts';
import { availableOnlineProviders } from '@/lib/payments/registry';

/**
 * GET /api/payment-accounts: the accounts this staff member may manage: every one for a clinic
 * admin; a doctor's own otherwise. Never a secret.
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const admin = isAdmin(ctx.session);
  const mine = await myDoctorProfileId(ctx.tenantId, ctx.session.userId);
  if (!admin && !mine) return NextResponse.json({ success: false, error: 'Only clinic admins and doctors have payment accounts.' }, { status: 403 });
  const accounts = admin ? await listAccounts(ctx.tenantId) : await listAccounts(ctx.tenantId, { ownerType: 'doctor', doctorId: mine });
  return NextResponse.json({ success: true, data: { accounts, providers: availableOnlineProviders(), myDoctorId: mine, isAdmin: admin } });
}

/** POST /api/payment-accounts: connect an account (online keys are checked with the provider first). */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const parsed = await parseBody(request, accountInputSchema);
  if (isValidationError(parsed)) return parsed;
  const input = parsed.data;

  const scope = await canManage(ctx.session, ctx.tenantId, input.ownerType, input.doctorId);
  if (!scope.ok) return NextResponse.json({ success: false, error: scope.error }, { status: scope.status });

  await connectDB();
  const acct = new PaymentAccount({
    tenantId: ctx.tenantObjectId,
    ownerType: input.ownerType,
    doctorId: scope.doctorId ? new Types.ObjectId(scope.doctorId) : undefined,
    provider: input.provider,
    label: input.label,
    webhookToken: newWebhookToken(),
    createdBy: new Types.ObjectId(ctx.session.userId),
  });
  const problem = await applyAccountInput(acct, input, true);
  if (problem) return NextResponse.json({ success: false, error: problem }, { status: 400 });

  const hasDefault = await PaymentAccount.exists({
    tenantId: ctx.tenantObjectId,
    ownerType: acct.ownerType,
    doctorId: acct.doctorId ?? { $exists: false },
    isDefault: true,
  });
  if (input.isDefault || !hasDefault) await setDefault(acct);
  await acct.save();

  await createAuditLog({
    userId: ctx.session.userId,
    userEmail: ctx.session.email,
    userRole: ctx.session.role,
    tenantId: ctx.tenantId,
    action: 'create',
    resource: 'settings',
    resourceId: acct._id,
    description: `Connected payment account “${acct.label}” (${acct.provider}${acct.ownerType === 'doctor' ? ', doctor’s own' : ''})`,
    metadata: { paymentAccount: String(acct._id), online: isOnlineProvider(acct.provider) },
  });
  return NextResponse.json({ success: true, data: accountView(acct) }, { status: 201 });
}
