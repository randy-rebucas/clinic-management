import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getOutstandingBalanceForPatient } from '@/lib/data/invoice';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const tenantId = session.tenantId || null;

    // Shared aggregation (also used by app/api/patients/[id]/outstanding-balance/route.ts)
    const { invoices, totalOutstanding } = await run(tenantId, () =>
      getOutstandingBalanceForPatient(patientId || undefined)
    );

    // Group by patient
    const byPatient = invoices.reduce((acc: any, invoice: any) => {
      const pid = invoice.patient?.id ?? invoice.patient?._id;
      if (!pid) return acc;
      if (!acc[pid]) {
        acc[pid] = {
          patient: invoice.patient,
          totalOutstanding: 0,
          invoiceCount: 0,
          invoices: [],
        };
      }
      acc[pid].totalOutstanding += invoice.outstandingBalance || 0;
      acc[pid].invoiceCount += 1;
      acc[pid].invoices.push(invoice);
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data: {
        totalOutstanding,
        totalInvoices: invoices.length,
        invoices,
        byPatient: Object.values(byPatient),
      },
    });
  } catch (error: any) {
    console.error('Error fetching outstanding invoices:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch outstanding invoices' },
      { status: 500 }
    );
  }
}
