import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { requirePermission } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import { requireTenantSession, isTenantSessionError, tenantFilter, patientTenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zShortText, roundMoney } from '@/lib/api/validate';
import { recordInvoicePayments, PAYMENT_EPSILON } from '@/lib/invoice-payments';

const paymentSchema = z.object({
  // 'online' is only recorded by the payment-gateway webhook, never typed by staff.
  method: z.enum(['cash', 'gcash', 'bank_transfer', 'card', 'check', 'insurance', 'hmo', 'cwt', 'other']).default('cash'),
  amount: z.number().finite().positive().max(100_000_000),
  // A day of slack for clock and timezone differences; never a payment weeks ahead.
  date: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 86_400_000, 'A payment can’t be dated in the future').optional(),
  receiptNo: zShortText.optional(),
  referenceNo: zShortText.optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Invoice');

    const parsed = await parseBody(request, paymentSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;
    const amount = roundMoney(body.amount);

    const current: any = await Invoice.findOne(tenantFilter(tenantId, { _id: new Types.ObjectId(id) })).select('total payments').lean();
    if (!current) return notFound('Invoice');
    const outstanding = roundMoney((Number(current.total) || 0) - (current.payments || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0));

    const settings = await getSettings(tenantId);
    if (settings.billingSettings?.allowPartialPayments === false && Math.abs(amount - outstanding) > PAYMENT_EPSILON) {
      return NextResponse.json(
        { success: false, error: 'Partial payments are not allowed; pay the full outstanding balance' },
        { status: 400 }
      );
    }

    const result = await recordInvoicePayments({
      tenantId,
      invoiceId: id,
      payments: [{ ...body, amount, processedBy: session.userId }],
    });
    if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    const invoice = result.invoice;

    await invoice.populate({
      path: 'patient',
      select: 'firstName lastName patientCode email phone',
      match: patientTenantFilter(tenantId),
    });
    await invoice.populate('visit', 'visitCode date');
    await invoice.populate('createdBy', 'name email');

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: any) {
    console.error('Error recording payment:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to record payment' },
      { status: 500 }
    );
  }
}
