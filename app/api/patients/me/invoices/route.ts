import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { runAsSystem } from '@/lib/tenant-context';
import { getPatientById } from '@/lib/data/patient';
import { listInvoices } from '@/lib/data/invoice';
import type { Prisma } from '@prisma/client';

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
    const patient = await runAsSystem(() => getPatientById(session.patientId));
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
    const patientTenantIds: string[] = (patient as any).tenantIds ?? [];

    const baseWhere: Prisma.InvoiceWhereInput = { patientId: session.patientId };
    if (tenantIdParam) {
      baseWhere.tenantId = tenantIdParam;
    } else if (patientTenantIds.length > 0) {
      baseWhere.tenantId = { in: patientTenantIds };
    }

    const invoiceWhere: Prisma.InvoiceWhereInput = { ...baseWhere };
    if (statusFilter) {
      invoiceWhere.status = statusFilter as Prisma.InvoiceWhereInput['status'];
    }

    const [allInvoices, unpaidInvoices] = await runAsSystem(() =>
      Promise.all([
        listInvoices(invoiceWhere),
        listInvoices({ ...baseWhere, status: { in: ['unpaid', 'partial'] } }),
      ])
    );

    const total = allInvoices.length;
    const invoices = allInvoices.slice(skip, skip + limit);

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
