import { NextRequest, NextResponse } from 'next/server';
import Invoice from '@/models/Invoice';
import logger from '@/lib/logger';
import { ownedRecordContext, isOwnedRecordError, recordNotFound } from '../../_lib/owned-record';

/**
 * GET /api/patients/me/invoices/[id]
 * One of the authenticated patient's invoices, with its outstanding balance.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await ownedRecordContext(request, id, 'Invoice');
    if (isOwnedRecordError(ctx)) return ctx;

    const invoice = await Invoice.findOne(ctx.filter).lean<any>();
    if (!invoice) return recordNotFound('Invoice');

    const paid = (invoice.payments ?? []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    return NextResponse.json({
      success: true,
      data: invoice,
      summary: { paid, balance: Math.max(0, (invoice.total || 0) - paid) },
    });
  } catch (error) {
    logger.error('Error fetching patient invoice detail', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch invoice' }, { status: 500 });
  }
}
