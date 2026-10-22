import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { isOnlineProvider } from '@/models/PaymentAccount';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { getSettings } from '@/lib/settings';
import { sendSMS, isSMSConfigured } from '@/lib/sms';
import { createAuditLog } from '@/lib/audit';
import { invoicePayOptions } from '@/lib/payments/accounts';
import { PROVIDER_LABEL } from '@/lib/payments/account-schema';
import { createPayPageToken } from '@/lib/payments/invoice-pay';

const bodySchema = z.object({
  sms: z.boolean().default(false),
  /** One account to offer; omitted = every account this invoice can be paid into. */
  accountId: z.string().refine((v) => Types.ObjectId.isValid(v), 'Unknown account').optional(),
});

function appOrigin(request: NextRequest): string {
  const o = request.headers.get('origin');
  if (o && o !== 'null') return o;
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

async function loadInvoice(id: string, tenantId: Types.ObjectId, tenantIdStr: string) {
  return Invoice.findOne({ _id: new Types.ObjectId(id), tenantId })
    .select('invoiceNumber status outstandingBalance total patient professionalFeeDoctor')
    .populate({ path: 'patient', select: 'firstName lastName phone email', match: patientTenantFilter(tenantIdStr) })
    .lean<any>();
}

/**
 * GET: where this invoice can be paid (the clinic's accounts and, for a doctor's professional
 * fee, the doctor's own), the default first. For the "Send payment link" picker.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Invoice');
  await connectDB();
  const inv = await loadInvoice(id, ctx.tenantObjectId, ctx.tenantId);
  if (!inv) return notFound('Invoice');
  const { accounts, defaultId } = await invoicePayOptions(ctx.tenantId, inv);
  return NextResponse.json({
    success: true,
    data: {
      defaultId,
      accounts: accounts.map((a) => ({
        id: String(a._id),
        label: a.label,
        provider: a.provider,
        providerLabel: PROVIDER_LABEL[a.provider],
        online: isOnlineProvider(a.provider),
        owner: a.ownerType,
      })),
    },
  });
}

/**
 * POST { sms, accountId? }: a link to the patient's pay page for what is still owed, optionally
 * texted to them. The page pays into the clinic's (or the doctor's) own account: online by
 * GCash, Maya or card, or by QR / bank transfer that staff confirm. Billing staff only.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Invoice');
  const parsed = await parseBody(request, bodySchema);
  if (isValidationError(parsed)) return parsed;

  try {
    await connectDB();
    const inv = await loadInvoice(id, ctx.tenantObjectId, ctx.tenantId);
    if (!inv) return notFound('Invoice');
    if (inv.status === 'refunded') return NextResponse.json({ success: false, error: 'This invoice was refunded.' }, { status: 409 });
    const owed = Math.round((Number(inv.outstandingBalance ?? inv.total) || 0) * 100) / 100;
    if (owed <= 0) return NextResponse.json({ success: false, error: 'Nothing is owed on this invoice.' }, { status: 400 });

    const settings = await getSettings(ctx.tenantId);
    if ((settings.billingSettings?.currency || 'PHP') !== 'PHP') {
      return NextResponse.json({ success: false, error: 'Payment links are in pesos; this clinic bills in another currency.' }, { status: 400 });
    }
    const { accounts } = await invoicePayOptions(ctx.tenantId, inv);
    const chosen = parsed.data.accountId ? accounts.find((a) => String(a._id) === parsed.data.accountId) : null;
    if (parsed.data.accountId && !chosen) return NextResponse.json({ success: false, error: 'That payment account can’t take this invoice.' }, { status: 400 });
    if (!accounts.length) {
      return NextResponse.json(
        { success: false, code: 'NO_PAYMENT_ACCOUNT', error: 'Add a payment account first (Admin → Payment accounts), so patients pay the clinic directly.' },
        { status: 409 }
      );
    }

    const { token, expiresAt } = createPayPageToken(ctx.tenantId, id, chosen ? String(chosen._id) : null);
    const url = `${appOrigin(request)}/pay/${token}`;
    const clinic = settings.clinicName || 'the clinic';

    let texted = false;
    if (parsed.data.sms && inv.patient?.phone && isSMSConfigured()) {
      const r = await sendSMS({
        to: inv.patient.phone,
        message: `${clinic}: you can pay the ₱${owed.toLocaleString('en-PH', { minimumFractionDigits: 2 })} balance on invoice ${inv.invoiceNumber} here: ${url}`,
      });
      texted = Boolean((r as { success?: boolean }).success);
    }
    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'create',
      resource: 'invoice',
      resourceId: id,
      description: `Made a payment link for ${owed.toFixed(2)} on ${inv.invoiceNumber}${chosen ? ` (${chosen.label})` : ''}${texted ? ' and texted it to the patient' : ''}`,
    });
    return NextResponse.json({ success: true, data: { url, amount: owed, texted, expiresAt } });
  } catch (error) {
    console.error('Error creating payment link:', error);
    return NextResponse.json({ success: false, error: 'The payment link couldn’t be made. Try again in a few minutes.' }, { status: 500 });
  }
}
