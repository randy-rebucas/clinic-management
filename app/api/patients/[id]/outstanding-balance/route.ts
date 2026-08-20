import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getOutstandingBalanceForPatient } from '@/lib/data/invoice';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const tenantId = session.tenantId || null;

    // Shared aggregation (also used by app/api/invoices/outstanding/route.ts)
    const { invoices, totalOutstanding } = await run(tenantId, () =>
      getOutstandingBalanceForPatient(id)
    );

    return NextResponse.json({
      success: true,
      data: {
        totalOutstanding,
        invoiceCount: invoices.length,
        invoices: invoices.map((inv: any) => ({
          _id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          total: inv.total,
          outstandingBalance: inv.outstandingBalance,
          status: inv.status,
          createdAt: inv.createdAt,
          visit: inv.visit,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error fetching outstanding balance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch outstanding balance' },
      { status: 500 }
    );
  }
}
