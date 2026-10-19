import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { requireApiKey, isApiError, apiError } from '@/lib/api-keys';
import { serializeInvoice } from '@/lib/public-api';

/** GET /api/v1/invoices/:id */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiKey(request, 'invoices:read');
  if (isApiError(ctx)) return ctx;
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return apiError(404, 'not_found', 'No such invoice.');

  await connectDB();
  const i = await Invoice.findOne({ _id: id, tenantId: ctx.tenantObjectId })
    .select('invoiceNumber patient visit status subtotal total totalPaid outstandingBalance items createdAt updatedAt')
    .lean<any>();
  if (!i) return apiError(404, 'not_found', 'No such invoice.');
  return NextResponse.json(serializeInvoice(i));
}
