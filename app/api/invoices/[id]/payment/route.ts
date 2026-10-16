import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { requirePermission } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import { requireTenantSession, isTenantSessionError, tenantFilter, patientTenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zShortText, roundMoney } from '@/lib/api/validate';

const paymentSchema = z.object({
  method: z.enum(['cash', 'gcash', 'bank_transfer', 'card', 'check', 'insurance', 'hmo', 'other']).default('cash'),
  amount: z.number().finite().positive().max(100_000_000),
  date: z.coerce.date().optional(),
  receiptNo: zShortText.optional(),
  referenceNo: zShortText.optional(),
  notes: z.string().max(2000).optional(),
});

const EPSILON = 0.005;

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

    const query = tenantFilter(tenantId, { _id: new Types.ObjectId(id) });
    const current: any = await Invoice.findOne(query).select('total payments status').lean();
    if (!current) return notFound('Invoice');
    if (current.status === 'refunded') {
      return NextResponse.json({ success: false, error: 'Cannot record a payment on a refunded invoice' }, { status: 409 });
    }

    const total = roundMoney(Number(current.total) || 0);
    const paid = roundMoney((current.payments || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0));
    const outstanding = roundMoney(total - paid);
    if (amount > outstanding + EPSILON) {
      return NextResponse.json(
        { success: false, error: `Payment exceeds the outstanding balance (${outstanding.toFixed(2)})` },
        { status: 400 }
      );
    }

    const settings = await getSettings(tenantId);
    if (settings.billingSettings?.allowPartialPayments === false && Math.abs(amount - outstanding) > EPSILON) {
      return NextResponse.json(
        { success: false, error: 'Partial payments are not allowed; pay the full outstanding balance' },
        { status: 400 }
      );
    }

    const payment = {
      _id: new Types.ObjectId(),
      method: body.method,
      amount,
      date: body.date ?? new Date(),
      receiptNo: body.receiptNo,
      referenceNo: body.referenceNo,
      processedBy: new Types.ObjectId(session.userId),
      notes: body.notes,
    };

    const paymentsSum = { $round: [{ $sum: { $ifNull: ['$payments.amount', []] } }, 2] };
    const totalExpr = { $ifNull: ['$total', 0] };

    // Single atomic update: the outstanding-balance guard, the $push, and the recomputed
    // totals/status all happen in one document write, so concurrent payments can't overpay.
    const invoice = await Invoice.findOneAndUpdate(
      {
        ...query,
        status: { $ne: 'refunded' },
        $expr: { $gte: [{ $subtract: [totalExpr, paymentsSum] }, amount - EPSILON] },
      },
      [
        { $set: { payments: { $concatArrays: [{ $ifNull: ['$payments', []] }, [{ $literal: payment }]] } } },
        { $set: { totalPaid: paymentsSum } },
        { $set: { outstandingBalance: { $round: [{ $subtract: [totalExpr, '$totalPaid'] }, 2] } } },
        {
          $set: {
            status: {
              $switch: {
                branches: [
                  { case: { $lte: ['$outstandingBalance', 0] }, then: 'paid' },
                  { case: { $gt: ['$totalPaid', 0] }, then: 'partial' },
                ],
                default: 'unpaid',
              },
            },
            updatedAt: '$$NOW',
          },
        },
      ],
      { new: true }
    );

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice changed while recording the payment. Please reload and try again.' },
        { status: 409 }
      );
    }

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
