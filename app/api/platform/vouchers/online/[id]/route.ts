import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import VoucherPurchase from '@/models/VoucherPurchase';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { createAuditLog } from '@/lib/audit';
import { decryptData } from '@/lib/encryption';
import { formatActivationCode } from '@/lib/emcr/activation';
import { checkPendingPayment, emailVoucherCode } from '@/lib/emcr/voucher-purchase';

/**
 * GET /api/platform/vouchers/online/[id]: the purchase's code in clear (paid purchases only).
 * Support reads it to a patient who lost it. Every reveal is audited.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Purchase');

  await connectDB();
  const purchase = await VoucherPurchase.findById(id).select('+codeEncrypted status email').lean<any>();
  if (!purchase) return notFound('Purchase');
  if (purchase.status !== 'paid') {
    return NextResponse.json({ success: false, error: 'This checkout isn’t paid, so it has no working code.' }, { status: 409 });
  }
  await createAuditLog({
    userEmail: admin.email,
    userRole: 'platform-admin',
    action: 'read',
    resource: 'settings',
    resourceId: purchase._id,
    description: `Viewed the code of online eMCR voucher ${id} (${purchase.email})`,
    metadata: { platform: true, emcrVoucherPurchase: id },
  });
  return NextResponse.json({ success: true, data: { code: formatActivationCode(decryptData(purchase.codeEncrypted)) } });
}

const PostSchema = z.discriminatedUnion('action', [
  /** Send the code again, to the buyer's address or a corrected one (which then replaces it). */
  z.object({ action: z.literal('resend'), email: z.string().trim().toLowerCase().email().max(254).optional() }),
  /** Ask PayMongo about a pending checkout and apply it if paid (a webhook that never came). */
  z.object({ action: z.literal('check') }),
]);

/**
 * POST /api/platform/vouchers/online/[id]
 * { action: 'resend', email? } → { sentTo }
 * { action: 'check' } → { status: 'paid' | 'unpaid', checkoutStatus? }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Purchase');
  const parsed = await parseBody(request, PostSchema);
  if (isValidationError(parsed)) return parsed;
  const body = parsed.data;

  await connectDB();
  const purchase = await VoucherPurchase.findById(id).select('+codeEncrypted').lean<any>();
  if (!purchase) return notFound('Purchase');

  if (body.action === 'check') {
    const r = await checkPendingPayment(purchase);
    await createAuditLog({
      userEmail: admin.email,
      userRole: 'platform-admin',
      action: 'update',
      resource: 'settings',
      resourceId: purchase._id,
      description: `Checked PayMongo for online eMCR voucher ${id}: ${r.state}`,
      metadata: { platform: true, emcrVoucherPurchase: id },
    });
    if (r.state === 'paid') return NextResponse.json({ success: true, data: { status: 'paid' } });
    if (r.state === 'unpaid') return NextResponse.json({ success: true, data: { status: 'unpaid', checkoutStatus: r.checkoutStatus } });
    if (r.state === 'no_checkout') return NextResponse.json({ success: false, error: 'This purchase never reached PayMongo.' }, { status: 409 });
    return NextResponse.json({ success: false, error: `Couldn’t apply it: ${r.error}` }, { status: 502 });
  }

  if (purchase.status !== 'paid') {
    return NextResponse.json({ success: false, error: 'This checkout isn’t paid, so there is no code to send.' }, { status: 409 });
  }
  const to = body.email ?? purchase.email;
  const sent = await emailVoucherCode(purchase._id, to, decryptData(purchase.codeEncrypted), purchase.token);
  if (!sent) return NextResponse.json({ success: false, error: 'The email couldn’t be sent. Check the email settings, or read the code to the patient.' }, { status: 502 });
  if (to !== purchase.email) await VoucherPurchase.updateOne({ _id: purchase._id }, { $set: { email: to } });
  await createAuditLog({
    userEmail: admin.email,
    userRole: 'platform-admin',
    action: 'update',
    resource: 'settings',
    resourceId: purchase._id,
    description: `Resent the code of online eMCR voucher ${id} to ${to}${to !== purchase.email ? ` (was ${purchase.email})` : ''}`,
    metadata: { platform: true, emcrVoucherPurchase: id },
  });
  return NextResponse.json({ success: true, data: { sentTo: to } });
}
