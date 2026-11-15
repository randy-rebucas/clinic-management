import { NextRequest, NextResponse } from 'next/server';
import Invoice from '@/models/Invoice';
import logger from '@/lib/logger';
import { ownedRecordContext, isOwnedRecordError, recordNotFound } from '../../_lib/owned-record';
import { invoiceBalance } from '../../_lib/invoice-balance';
import { PATIENT_INVOICE_SELECT } from '../../_lib/invoice-fields';

/**
 * GET /api/patients/me/invoices/[id]
 * One of the authenticated patient's invoices, with its outstanding balance
 * (0 once the invoice is paid or refunded, matching the list's summary).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await ownedRecordContext(request, id, 'Invoice');
    if (isOwnedRecordError(ctx)) return ctx;

    const invoice = await Invoice.findOne(ctx.filter).select(PATIENT_INVOICE_SELECT).lean<any>();
    if (!invoice) return recordNotFound('Invoice');

    return NextResponse.json({
      success: true,
      data: invoice,
      summary: invoiceBalance(invoice),
    });
  } catch (error) {
    logger.error('Error fetching patient invoice detail', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch invoice' }, { status: 500 });
  }
}
