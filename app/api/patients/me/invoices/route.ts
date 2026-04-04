import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Invoice from '@/models/Invoice';
import logger from '@/lib/logger';
import { verifyPatientSession } from '@/app/lib/dal';

/**
 * GET /api/patients/me/invoices
 * Returns a paginated list of the authenticated patient's invoices
 * Also returns outstanding balance summary
 * Query params: page (default 1), limit (default 10, max 50), status?, tenantId?
 */
export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get('patient_session');
  const session = await verifyPatientSession(sessionCookie?.value);

  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated. Please login.' },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    const patient = await Patient.findById(session.patientId).lean();
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }
    if ((patient as any).active === false) {
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10)));
    const skip = (page - 1) * limit;
    const statusFilter = searchParams.get('status');
    const tenantIdParam = searchParams.get('tenantId');
    const patientTenantIds = (patient as any).tenantIds ?? [];

    const baseQuery: any = { patient: session.patientId };
    if (tenantIdParam) {
      baseQuery.tenantId = tenantIdParam;
    } else if (patientTenantIds.length > 0) {
      baseQuery.tenantId = { $in: patientTenantIds };
    }

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
        .select('total payments')
        .lean(),
    ]);

    const outstandingBalance = unpaidInvoices.reduce((sum: number, inv: any) => {
      const paid = (inv.payments ?? []).reduce(
        (pSum: number, p: any) => pSum + (p.amount || 0),
        0
      );
      return sum + Math.max(0, (inv.total || 0) - paid);
    }, 0);

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
