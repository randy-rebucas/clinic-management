import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listInvoices, buildInvoiceWhere, createInvoice, getMaxInvoiceNumber } from '@/lib/data/invoice';
import { getPatientById } from '@/lib/data/patient';
import { getSettings } from '@/lib/settings';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

class ValidationError extends Error {}

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'invoices', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const visitId = searchParams.get('visitId');
    const status = searchParams.get('status');

    const where = buildInvoiceWhere({
      patientId: patientId || undefined,
      visitId: visitId || undefined,
      status: status || undefined,
    });

    const invoices = await run(tenantId, () => listInvoices(where));

    return NextResponse.json({ success: true, data: invoices });
  } catch (error: any) {
    console.error('Error fetching invoices:', error);
    let errorMessage = 'Failed to fetch invoices';
    if (error && error.message) {
      errorMessage += `: ${error.message}`;
    }
    return NextResponse.json(
      { success: false, error: errorMessage, details: error?.stack || error },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'invoices', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const body = await request.json();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const invoice = await run(tenantId, async () => {
      // Validate that the patient belongs to the tenant (junction-scoped)
      if (body.patient && tenantId) {
        const patient = await runAsSystem(() => getPatientById(body.patient));
        const belongsToTenant = patient?.tenantIds?.some((tid: string) => tid === tenantId);
        if (!belongsToTenant) {
          throw new ValidationError('Invalid patient selected. Please select a patient from this clinic.');
        }
      }

      // Auto-generate invoice number using settings prefix (tenant-scoped)
      const settings = await getSettings(tenantId);
      const invoicePrefix = settings.billingSettings?.invoicePrefix || 'INV';
      const nextNumber = (await getMaxInvoiceNumber()) + 1;
      const invoiceNumber = `${invoicePrefix}-${String(nextNumber).padStart(6, '0')}`;

      return createInvoice(
        { ...body, invoiceNumber },
        { patientId: body.patient, visitId: body.visit || undefined, createdById: body.createdBy || session.userId }
      );
    });

    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create invoice' },
      { status: 500 }
    );
  }
}
