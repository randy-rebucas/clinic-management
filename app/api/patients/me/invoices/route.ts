import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Invoice from '@/models/Invoice';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { parsePagination, resolveTenantFilter } from '../_lib/patient-scope';
import { linkedRecords } from '../_lib/linked-records';
import { OPEN_INVOICE_STATUSES, PATIENT_INVOICE_SELECT } from '../_lib/invoice-fields';

const INVOICE_STATUSES = ['unpaid', 'partial', 'paid', 'refunded'];

/** An id as an ObjectId: aggregate() does not cast filter values the way find() does. */
function objectId(id: unknown): unknown {
  return typeof id === 'string' && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id;
}

function castIds(value: unknown): unknown {
  if (value && typeof value === 'object' && '$in' in value && Array.isArray((value as { $in: unknown[] }).$in)) {
    return { $in: (value as { $in: unknown[] }).$in.map(objectId) };
  }
  return objectId(value);
}

/**
 * Outstanding balance across every open invoice, summed in the database instead of loading each
 * one. Same rule as invoiceBalance() for unpaid/partial invoices: total - payments, floored at 0.
 */
async function outstandingSummary(filter: Record<string, unknown>): Promise<{ outstandingBalance: number; unpaidCount: number }> {
  const match: Record<string, unknown> = { ...filter, status: { $in: OPEN_INVOICE_STATUSES } };
  if (match.patient !== undefined) match.patient = castIds(match.patient);
  if (match.tenantId !== undefined) match.tenantId = castIds(match.tenantId);
  const [row] = await Invoice.aggregate<{ outstandingBalance: number; unpaidCount: number }>([
    { $match: match },
    {
      $group: {
        _id: null,
        outstandingBalance: {
          $sum: {
            $max: [0, { $subtract: [{ $ifNull: ['$total', 0] }, { $sum: { $ifNull: ['$payments.amount', []] } }] }],
          },
        },
        unpaidCount: { $sum: 1 },
      },
    },
  ]);
  return { outstandingBalance: row?.outstandingBalance ?? 0, unpaidCount: row?.unpaidCount ?? 0 };
}

/**
 * GET /api/patients/me/invoices
 * Returns a paginated list of the authenticated patient's invoices
 * Also returns outstanding balance summary
 * Query params: page (default 1), limit (default 10, max 50), status?, tenantId?
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request);

  if (!session) return patientAuthError(request);

  try {
    await connectDB();

    const patient = await Patient.findById(session.patientId).select('active email tenantIds accountId').lean();
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }
    if ((patient as any).active === false) {
      await recordPatientRefused(patient as any, request, 'access');
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams, { defaultLimit: 10, maxLimit: 50 });
    const statusFilter = searchParams.get('status');
    if (statusFilter && !INVOICE_STATUSES.includes(statusFilter)) {
      return NextResponse.json({ success: false, error: 'Invalid status.' }, { status: 400 });
    }

    // This person's records at every clinic (one per clinic when linked by phone).
    const linked = await linkedRecords(patient as any);
    const tenant = resolveTenantFilter(linked.tenantIds, session, searchParams.get('tenantId'));
    if (!tenant.ok) return tenant.response;

    const baseQuery: any = { patient: { $in: linked.patientIds }, ...tenant.filter };

    const invoiceQuery = { ...baseQuery };
    if (statusFilter) {
      invoiceQuery.status = statusFilter;
    }

    const [invoices, total, summary] = await Promise.all([
      Invoice.find(invoiceQuery)
        .select(PATIENT_INVOICE_SELECT)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Invoice.countDocuments(invoiceQuery),
      // Always the outstanding balance across all unpaid/partial invoices, whatever the filter.
      outstandingSummary(baseQuery),
    ]);

    return NextResponse.json({
      success: true,
      data: invoices,
      summary,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    logger.error('Error fetching patient invoices', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}
