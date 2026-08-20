import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit'; // OUT OF SCOPE (still Mongoose) — audit logging left untouched, same precedent as every prior batch
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listReferrals, buildReferralWhere, createReferral, countReferrals } from '@/lib/data/referral';
import { getPatientById } from '@/lib/data/patient';
import { getDoctorById } from '@/lib/data/doctor';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

class ValidationError extends Error {}

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'referrals', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || null;

    const searchParams = request.nextUrl.searchParams;
    const referringDoctor = searchParams.get('referringDoctor');
    const receivingDoctor = searchParams.get('receivingDoctor');
    const patientId = searchParams.get('patientId');
    const status = searchParams.get('status');
    const type = searchParams.get('type');

    const where = buildReferralWhere({
      referringDoctorId: referringDoctor || undefined,
      receivingDoctorId: receivingDoctor || undefined,
      patientId: patientId || undefined,
      status: status || undefined,
      type: type || undefined,
    });

    const referrals = await run(tenantId, () => listReferrals(where));

    return NextResponse.json({ success: true, data: referrals });
  } catch (error: any) {
    console.error('Error fetching referrals:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch referrals' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'referrals', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const body = await request.json();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || null;

    const referral = await run(tenantId, async () => {
      // Validate that the patient belongs to the tenant (junction-scoped)
      if (body.patient && tenantId) {
        const patient = await runAsSystem(() => getPatientById(body.patient));
        const belongsToTenant = patient?.tenantIds?.some((tid: string) => tid === tenantId);
        if (!belongsToTenant) {
          throw new ValidationError('Invalid patient selected. Please select a patient from this clinic.');
        }
      }

      // Validate that doctors belong to the tenant (Doctor is directly tenant-scoped)
      if (body.referringDoctor) {
        const doctor = await getDoctorById(body.referringDoctor);
        if (!doctor) {
          throw new ValidationError('Invalid referring doctor selected. Please select a doctor from this clinic.');
        }
      }
      if (body.receivingDoctor) {
        const doctor = await getDoctorById(body.receivingDoctor);
        if (!doctor) {
          throw new ValidationError('Invalid receiving doctor selected. Please select a doctor from this clinic.');
        }
      }

      // Generate referral code if not provided (tenant-scoped)
      let referralCode = body.referralCode;
      if (!referralCode) {
        const count = await countReferrals();
        referralCode = `REF-${Date.now()}-${count + 1}`;
      }

      return createReferral(
        { ...body, referralCode },
        {
          patientId: body.patient,
          referringDoctorId: body.referringDoctor || undefined,
          receivingDoctorId: body.receivingDoctor || undefined,
          referringPatientId: body.referringPatient || undefined,
          visitId: body.visit || undefined,
          appointmentId: body.appointment || undefined,
        }
      );
    });

    // Log referral creation. OUT OF SCOPE — lib/audit.ts calls stay on
    // Mongoose, same precedent as every prior batch.
    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: tenantId || undefined,
      action: 'create',
      resource: 'patient',
      resourceId: referral.id,
      description: `Created ${referral.type} referral for patient ${referral.patientId}`,
    });

    return NextResponse.json({ success: true, data: referral }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating referral:', error);
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create referral' },
      { status: 500 }
    );
  }
}
