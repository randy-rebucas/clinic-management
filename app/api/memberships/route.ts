import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit'; // OUT OF SCOPE (still Mongoose) — audit logging left untouched, same precedent as every prior batch
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import {
  listMemberships,
  buildMembershipWhere,
  createMembership,
  getMembershipByPatientId,
  addReferralBonus,
} from '@/lib/data/membership';
import { getPatientById } from '@/lib/data/patient';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

class ValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || null;

    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');
    const tier = searchParams.get('tier');
    const status = searchParams.get('status');

    const where = buildMembershipWhere({
      patientId: patientId || undefined,
      tier: tier || undefined,
      status: status || undefined,
    });

    const memberships = await run(tenantId, () => listMemberships(where));

    return NextResponse.json({ success: true, data: memberships });
  } catch (error: any) {
    console.error('Error fetching memberships:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch memberships' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || null;

    const body = await request.json();
    const { patientId, tier, referredBy } = body;

    if (!patientId) {
      return NextResponse.json(
        { success: false, error: 'Patient ID required' },
        { status: 400 }
      );
    }

    const membership = await run(tenantId, async () => {
      // Validate that the patient belongs to the tenant (junction-scoped)
      const patient = await runAsSystem(() => getPatientById(patientId));
      if (!patient || (tenantId && !patient.tenantIds?.some((tid: string) => tid === tenantId))) {
        throw new ValidationError('Patient not found', 404);
      }

      // Check if patient already has membership (tenant-scoped)
      const existing = await getMembershipByPatientId(patientId);
      if (existing) {
        throw new ValidationError('Patient already has a membership', 409);
      }

      const created = await createMembership(
        { tier: tier || 'bronze' },
        { patientId, referredById: referredBy || undefined }
      );

      // Award referral bonus points to both sides in the same tenant-scoped
      // context, atomically per-membership via addReferralBonus() /
      // addPointsTransaction()'s single-update pattern.
      if (referredBy) {
        const referringMembership = await getMembershipByPatientId(referredBy);
        if (referringMembership) {
          await addReferralBonus(referringMembership.id, 100, 'Referral bonus');
        }
        await addReferralBonus(created.id, 100, 'Welcome bonus (referred)');
      }

      return created;
    });

    // Log membership creation. OUT OF SCOPE — lib/audit.ts calls stay on
    // Mongoose, same precedent as every prior batch.
    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: tenantId || undefined,
      action: 'create',
      resource: 'patient',
      resourceId: membership.patientId,
      description: `Created membership for patient ${patientId}`,
    });

    return NextResponse.json({ success: true, data: membership }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating membership:', error);
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create membership' },
      { status: 500 }
    );
  }
}
