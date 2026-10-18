import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Invoice from '@/models/Invoice';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { parsePagination, resolveTenantFilter } from '../_lib/patient-scope';
import { linkedRecords } from '../_lib/linked-records';
import { invoiceBalance } from '../_lib/invoice-balance';

const INVOICE_STATUSES = ['unpaid', 'partial', 'paid', 'refunded'];

/**
 * GET /api/patients/me/invoices
 * Returns a paginated list of the authenticated patient's invoices
 * Also returns outstanding balance summary
 * Query params: page (default 1), limit (default 10, max 50), status?, tenantId?
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request);

  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated. Please login.' },
      { status: 401 }
    );
  }

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

    const [invoices, total, unpaidInvoices] = await Promise.all([
      Invoice.find(invoiceQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Invoice.countDocuments(invoiceQuery),
      // Always compute outstanding balance across all unpaid/partial invoices
      Invoice.find({ ...baseQuery, status: { $in: ['unpaid', 'partial'] } })
        .select('total payments status')
        .lean(),
    ]);

    const outstandingBalance = unpaidInvoices.reduce((sum: number, inv: any) => sum + invoiceBalance(inv).balance, 0);

    return NextResponse.json({
      success: true,
      data: invoices,
      summary: {
        outstandingBalance,
        unpaidCount: unpaidInvoices.length,
      },
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
