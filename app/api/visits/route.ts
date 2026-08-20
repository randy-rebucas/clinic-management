import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listVisits, buildVisitWhere, createVisit, getMaxVisitCodeNumber } from '@/lib/data/visit';
import { getPatientById } from '@/lib/data/patient';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'visits', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const providerId = searchParams.get('providerId');
    const status = searchParams.get('status');
    const date = searchParams.get('date');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 0;

    const where = buildVisitWhere({
      patientId: patientId || undefined,
      providerId: providerId || undefined,
      status: status || undefined,
      date: date || undefined,
    });

    const visits = await run(tenantId, () => listVisits(where, limit));

    return NextResponse.json({ success: true, data: visits });
  } catch (error: any) {
    console.error('Error fetching visits:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch visits' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'visits', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const body = await request.json();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (tenantId) {
      const { checkSubscriptionLimit } = await import('@/lib/subscription-limits');
      const limitCheck = await checkSubscriptionLimit(tenantId, 'createVisit');
      if (!limitCheck.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: limitCheck.reason || 'Subscription limit exceeded',
            limit: limitCheck.limit,
            current: limitCheck.current,
            remaining: limitCheck.remaining,
          },
          { status: 403 }
        );
      }
    }

    if (body.digitalSignature) {
      const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
      body.digitalSignature = {
        ...body.digitalSignature,
        providerId: session.userId,
        signedAt: new Date(),
        ipAddress: clientIp,
      };
    }

    const visit = await run(tenantId, async () => {
      // Validate that the patient belongs to the tenant (junction-scoped)
      if (body.patient && tenantId) {
        const patient = await runAsSystem(() => getPatientById(body.patient));
        const belongsToTenant = patient?.tenantIds?.some((tid: string) => tid === tenantId);
        if (!belongsToTenant) {
          throw new ValidationError('Invalid patient selected. Please select a patient from this clinic.');
        }
      }

      if (!body.visitCode) {
        const nextNumber = (await getMaxVisitCodeNumber()) + 1;
        body.visitCode = `VISIT-${String(nextNumber).padStart(6, '0')}`;
      }

      if (!body.provider) {
        body.provider = session.userId;
      }

      return createVisit(body, { patientId: body.patient, providerId: body.provider });
    });

    // Auto-create prescription if medications are present in treatment plan
    let prescriptionId: string | undefined;
    if (body.treatmentPlan?.medications && body.treatmentPlan.medications.length > 0) {
      try {
        // NOTE: lib/automations/prescription-from-visit.ts is out of scope
        // for this batch and still queries Mongoose's Visit/Prescription
        // models directly by ObjectId — flagged for whichever batch
        // migrates the automations layer, since visit.id is now a Postgres
        // UUID that won't resolve against the Mongo collection.
        const { createPrescriptionFromVisit } = await import('@/lib/automations/prescription-from-visit');
        const { Types } = await import('mongoose');
        const prescription = await createPrescriptionFromVisit({
          visitId: visit.id,
          tenantId: tenantId ? new Types.ObjectId(tenantId) : undefined,
          createdBy: session.userId,
          shouldSendNotification: true,
        });
        if (prescription && (prescription as any)._id) {
          prescriptionId = (prescription as any)._id.toString();
        } else if (prescription && (prescription as any).id) {
          prescriptionId = (prescription as any).id.toString();
        }
      } catch (error) {
        console.error('Error auto-creating prescription from visit:', error);
      }
    }

    return NextResponse.json({ success: true, data: visit, prescriptionId }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating visit:', error);
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Failed to create visit' }, { status: 500 });
  }
}

class ValidationError extends Error {}
