import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getPrescriptionById, updatePrescription, deletePrescription, findPrescriptionRawById } from '@/lib/data/prescription';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'prescriptions', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const prescription = await run(tenantId, () => getPrescriptionById(id));

    if (!prescription) {
      return NextResponse.json({ success: false, error: 'Prescription not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: prescription });
  } catch (error: any) {
    console.error('Error fetching prescription:', error);
    const errorMessage = error.message || error.toString() || 'Failed to fetch prescription';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'prescriptions', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    const body = await request.json();

    if (body.visit === '' || body.visit === null) body.visit = undefined;
    if (body.prescribedBy === '' || body.prescribedBy === null) body.prescribedBy = undefined;
    if (body.patient === '' || body.patient === null) body.patient = undefined;

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const prescription = await run(tenantId, async () => {
      const existing = await findPrescriptionRawById(id);
      if (!existing) return null;
      return updatePrescription(id, body);
    });

    if (!prescription) {
      return NextResponse.json({ success: false, error: 'Prescription not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: prescription });
  } catch (error: any) {
    console.error('Error updating prescription:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update prescription' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'prescriptions', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const deleted = await run(tenantId, async () => {
      const existing = await findPrescriptionRawById(id);
      if (!existing) return null;
      await deletePrescription(id);
      return existing;
    });

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Prescription not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    console.error('Error deleting prescription:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete prescription' }, { status: 500 });
  }
}
