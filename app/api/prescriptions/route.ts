import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listPrescriptions, buildPrescriptionWhere, createPrescription, getMaxPrescriptionCodeNumber } from '@/lib/data/prescription';
import { getPatientById } from '@/lib/data/patient';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'prescriptions', 'read');
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

    const where = buildPrescriptionWhere({
      patientId: patientId || undefined,
      visitId: visitId || undefined,
      status: status || undefined,
    });

    const prescriptions = await run(tenantId, () => listPrescriptions(where));

    return NextResponse.json({ success: true, data: prescriptions });
  } catch (error: any) {
    console.error('Error fetching prescriptions:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch prescriptions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'prescriptions', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const body = await request.json();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Sanitize empty-string relation fields
    if (body.visit === '' || body.visit === null) body.visit = undefined;
    if (body.prescribedBy === '' || body.prescribedBy === null) body.prescribedBy = undefined;

    if (body.digitalSignature) {
      body.digitalSignature = { ...body.digitalSignature, signedAt: new Date() };
    }

    if (body.drugInteractions && Array.isArray(body.drugInteractions)) {
      body.drugInteractions = body.drugInteractions.map((interaction: any) => ({
        ...interaction,
        checkedAt: interaction.checkedAt ? new Date(interaction.checkedAt) : new Date(),
      }));
    }

    if (!body.prescribedBy) {
      body.prescribedBy = session.userId;
    }

    const prescription = await run(tenantId, async () => {
      // Validate that the patient belongs to the tenant (junction-scoped)
      if (body.patient && tenantId) {
        const patient = await runAsSystem(() => getPatientById(body.patient));
        const belongsToTenant = patient?.tenantIds?.some((tid: string) => tid === tenantId);
        if (!belongsToTenant) {
          throw new ValidationError('Invalid patient selected. Please select a patient from this clinic.');
        }
      }

      const nextNumber = (await getMaxPrescriptionCodeNumber()) + 1;

      return createPrescription(
        { ...body, prescriptionCode: `RX-${String(nextNumber).padStart(6, '0')}` },
        { patientId: body.patient, visitId: body.visit, prescribedById: body.prescribedBy }
      );
    });

    return NextResponse.json({ success: true, data: prescription }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating prescription:', error);
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Failed to create prescription' }, { status: 500 });
  }
}

class ValidationError extends Error {}
