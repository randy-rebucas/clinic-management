import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zShortText, roundMoney } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { recordInvoicePayments, PAYMENT_EPSILON } from '@/lib/invoice-payments';

const notFuture = (d: Date) => d.getTime() <= Date.now() + 86_400_000;

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('file'), claimNumber: zShortText.optional(), filedAt: z.coerce.date().refine(notFuture, 'Not in the future').optional() }),
  z.object({
    action: z.literal('pay'),
    amount: z.number().finite().min(0).max(100_000_000),
    withheld: z.number().finite().min(0).max(100_000_000).default(0),
    date: z.coerce.date().refine(notFuture, 'A payment can’t be dated in the future'),
    reference: zShortText.optional(),
  }),
  z.object({ action: z.literal('return'), note: z.string().trim().min(1, 'Say why PhilHealth returned it.').max(1000) }),
  z.object({ action: z.literal('deny'), note: z.string().trim().max(1000).optional() }),
]);

/**
 * PUT { action } on the PhilHealth claim of invoice :id.
 *  file: filed through eClaims (with the claim series number, when known).
 *  pay: PhilHealth paid; the payment and any tax withheld post to the invoice.
 *  return: returned for correction ("return to hospital"); fix the bill and file again.
 *  deny: refused; the patient owes the benefit amount.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Claim');
  const parsed = await parseBody(request, actionSchema);
  if (isValidationError(parsed)) return parsed;
  const body = parsed.data;

  try {
    await connectDB();
    const query = { _id: new Types.ObjectId(id), tenantId: ctx.tenantObjectId };
    const inv = await Invoice.findOne(query).select('invoiceNumber status philhealth').lean<any>();
    if (!inv?.philhealth) return notFound('Claim');
    if (inv.status === 'refunded') return NextResponse.json({ success: false, error: 'This bill was refunded.' }, { status: 409 });
    const ph = inv.philhealth;
    const audit = (description: string) =>
      createAuditLog({ userId: ctx.session.userId, userEmail: ctx.session.email, userRole: ctx.session.role, tenantId: ctx.tenantId, action: 'update', resource: 'philhealth', resourceId: id, description });
    const refuse = (error: string) => NextResponse.json({ success: false, error }, { status: 409 });

    if (body.action === 'file') {
      if (!['draft', 'returned'].includes(ph.status)) return refuse('This claim has already been filed.');
      await Invoice.updateOne(query, {
        $set: { 'philhealth.status': 'filed', 'philhealth.filedAt': body.filedAt ?? new Date(), ...(body.claimNumber ? { 'philhealth.claimNumber': body.claimNumber } : {}) },
      });
      await audit(`Filed the PhilHealth claim on ${inv.invoiceNumber}`);
      return NextResponse.json({ success: true, data: { status: 'filed' } });
    }

    if (body.action === 'pay') {
      if (ph.status !== 'filed') return refuse('Only a filed claim can be paid.');
      const amount = roundMoney(body.amount);
      const withheld = roundMoney(body.withheld);
      if (amount + withheld > ph.amount + PAYMENT_EPSILON) return NextResponse.json({ success: false, error: `That’s more than the claim (${ph.amount.toFixed(2)}).` }, { status: 400 });
      const ref = [ph.claimNumber, body.reference].filter(Boolean).join(' · ') || undefined;
      const result = await recordInvoicePayments({
        tenantId: ctx.tenantId,
        invoiceId: id,
        payments: [
          { method: 'philhealth', amount, date: body.date, referenceNo: ref, processedBy: ctx.session.userId, notes: `PhilHealth ${ph.caseRateCode}` },
          { method: 'cwt', amount: withheld, date: body.date, referenceNo: ref, processedBy: ctx.session.userId, notes: 'Withheld by PhilHealth' },
        ],
        alsoSet: { 'philhealth.status': 'paid', 'philhealth.paidAt': body.date, 'philhealth.paidAmount': amount, 'philhealth.withheldAmount': withheld },
      });
      if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
      await audit(`Recorded PhilHealth’s payment on ${inv.invoiceNumber}`);
      return NextResponse.json({ success: true, data: { status: 'paid' } });
    }

    if (body.action === 'return') {
      if (ph.status !== 'filed') return refuse('Only a filed claim can be returned.');
      await Invoice.updateOne(query, { $set: { 'philhealth.status': 'returned', 'philhealth.note': body.note } });
      await audit(`PhilHealth returned the claim on ${inv.invoiceNumber}`);
      return NextResponse.json({ success: true, data: { status: 'returned' } });
    }

    if (!['filed', 'returned', 'draft'].includes(ph.status)) return refuse('This claim is already settled.');
    await Invoice.updateOne(query, { $set: { 'philhealth.status': 'denied', ...(body.note ? { 'philhealth.note': body.note } : {}) } });
    await audit(`PhilHealth denied the claim on ${inv.invoiceNumber}`);
    return NextResponse.json({ success: true, data: { status: 'denied' } });
  } catch (error) {
    console.error('Error updating PhilHealth claim:', error);
    return NextResponse.json({ success: false, error: 'Failed to update the claim' }, { status: 500 });
  }
}
