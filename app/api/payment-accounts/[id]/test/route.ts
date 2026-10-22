import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import PaymentAccount from '@/models/PaymentAccount';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { canManage, loadCredentials } from '@/lib/payments/accounts';
import { adapterFor } from '@/lib/payments/registry';

/** POST /api/payment-accounts/[id]/test: check the stored key with the provider. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
  await connectDB();
  const acct = await PaymentAccount.findOne({ _id: new Types.ObjectId(id), tenantId: ctx.tenantObjectId }).select('+secretKeyEnc +webhookSecretEnc');
  if (!acct) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
  const scope = await canManage(ctx.session, ctx.tenantId, acct.ownerType, acct.doctorId ? String(acct.doctorId) : null);
  if (!scope.ok) return NextResponse.json({ success: false, error: scope.error }, { status: scope.status });

  const adapter = adapterFor(acct.provider);
  const creds = await loadCredentials(acct);
  if (!adapter || !creds) return NextResponse.json({ success: false, error: 'This account has no online key to test.' }, { status: 409 });
  const result = await adapter.testConnection(creds);
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  await PaymentAccount.updateOne({ _id: acct._id }, { $set: { verifiedAt: new Date(), mode: result.mode } });
  return NextResponse.json({ success: true, data: { mode: result.mode } });
}
