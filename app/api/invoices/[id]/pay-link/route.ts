import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { getSettings } from '@/lib/settings';
import { createCheckoutSession, isPayMongoConfigured } from '@/lib/paymongo';
import { sendSMS, isSMSConfigured } from '@/lib/sms';
import { createAuditLog } from '@/lib/audit';

const bodySchema = z.object({ sms: z.boolean().default(false) });

function appOrigin(request: NextRequest): string {
  const o = request.headers.get('origin');
  if (o && o !== 'null') return o;
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * POST { sms }: a PayMongo payment link for what is still owed on the invoice (GCash, Maya,
 * cards, QR Ph), optionally texted to the patient. The payment lands on the invoice by itself
 * when PayMongo confirms it. Billing staff (invoices:write).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;
  if (!isPayMongoConfigured()) return NextResponse.json({ success: false, error: 'Online payment isn’t set up on this server.' }, { status: 503 });
  const { id } = await params;
  if (!isValidId(id)) return notFound('Invoice');
  const parsed = await parseBody(request, bodySchema);
  if (isValidationError(parsed)) return parsed;

  try {
    await connectDB();
    const inv = await Invoice.findOne({ _id: new Types.ObjectId(id), tenantId: ctx.tenantObjectId })
      .select('invoiceNumber status outstandingBalance total patient')
      .populate({ path: 'patient', select: 'firstName lastName phone email', match: patientTenantFilter(ctx.tenantId) })
      .lean<any>();
    if (!inv) return notFound('Invoice');
    if (inv.status === 'refunded') return NextResponse.json({ success: false, error: 'This invoice was refunded.' }, { status: 409 });
    const owed = Math.round((Number(inv.outstandingBalance ?? inv.total) || 0) * 100) / 100;
    // PayMongo's smallest charge is ₱20.
    if (owed < 20) return NextResponse.json({ success: false, error: owed <= 0 ? 'Nothing is owed on this invoice.' : 'Online payments start at ₱20.' }, { status: 400 });

    const settings = await getSettings(ctx.tenantId);
    if ((settings.billingSettings?.currency || 'PHP') !== 'PHP') return NextResponse.json({ success: false, error: 'Online payment links are in pesos; this clinic bills in another currency.' }, { status: 400 });
    const clinic = settings.clinicName || 'the clinic';
    const origin = appOrigin(request);
    const checkout = await createCheckoutSession({
      name: `${clinic}: invoice ${inv.invoiceNumber}`,
      amount: owed,
      description: `Balance on invoice ${inv.invoiceNumber}`,
      referenceNumber: inv.invoiceNumber,
      successUrl: `${origin}/pay/done?ref=${encodeURIComponent(inv.invoiceNumber)}`,
      cancelUrl: `${origin}/pay/done?cancelled=1`,
      email: inv.patient?.email || undefined,
      metadata: { purpose: 'invoice', tenantId: ctx.tenantId, invoiceId: id, invoiceNumber: inv.invoiceNumber },
    });

    let texted = false;
    if (parsed.data.sms && inv.patient?.phone && isSMSConfigured()) {
      const r = await sendSMS({
        to: inv.patient.phone,
        message: `${clinic}: you can pay the ₱${owed.toLocaleString('en-PH', { minimumFractionDigits: 2 })} balance on invoice ${inv.invoiceNumber} by GCash, Maya or card here: ${checkout.checkoutUrl}`,
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
      description: `Made a payment link for ${owed.toFixed(2)} on ${inv.invoiceNumber}${texted ? ' and texted it to the patient' : ''}`,
    });
    return NextResponse.json({ success: true, data: { url: checkout.checkoutUrl, amount: owed, texted } });
  } catch (error) {
    console.error('Error creating payment link:', error);
    return NextResponse.json({ success: false, error: 'PayMongo couldn’t make the link. Try again in a few minutes.' }, { status: 502 });
  }
}
