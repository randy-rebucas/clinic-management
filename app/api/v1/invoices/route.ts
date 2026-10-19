import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { requireApiKey, isApiError, apiError, pageParams, pageOf } from '@/lib/api-keys';
import { serializeInvoice } from '@/lib/public-api';

const STATUSES = ['unpaid', 'partial', 'paid', 'refunded'];
const INVOICE_FIELDS = 'invoiceNumber patient visit status subtotal total totalPaid outstandingBalance items createdAt updatedAt';

/** GET /api/v1/invoices — newest first. Query: limit, cursor, status, patient_id, updated_since. */
export async function GET(request: NextRequest) {
  const ctx = await requireApiKey(request, 'invoices:read');
  if (isApiError(ctx)) return ctx;
  const page = pageParams(request);
  if (page instanceof NextResponse) return page;

  const sp = request.nextUrl.searchParams;
  const filter: Record<string, unknown> = { tenantId: ctx.tenantObjectId };
  if (page.after) filter._id = { $lt: page.after };
  const status = sp.get('status');
  if (status) {
    if (!STATUSES.includes(status)) return apiError(400, 'invalid_parameter', `status must be one of ${STATUSES.join(', ')}.`);
    filter.status = status;
  }
  const patientId = sp.get('patient_id');
  if (patientId) {
    if (!Types.ObjectId.isValid(patientId)) return apiError(400, 'invalid_parameter', 'patient_id is not a valid id.');
    filter.patient = new Types.ObjectId(patientId);
  }
  const since = sp.get('updated_since');
  if (since) {
    const d = new Date(since);
    if (Number.isNaN(d.getTime())) return apiError(400, 'invalid_parameter', 'updated_since must be an ISO 8601 date.');
    filter.updatedAt = { $gte: d };
  }

  await connectDB();
  const rows = await Invoice.find(filter).select(INVOICE_FIELDS).sort({ _id: -1 }).limit(page.limit + 1).lean<any[]>();
  return NextResponse.json(pageOf(rows.map(serializeInvoice), page.limit));
}
