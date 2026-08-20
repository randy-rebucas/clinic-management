import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import logger from '@/lib/logger';
import {
  getPatientByIdWithAuthFields,
  findPatientAcrossTenantsWithAuthFields,
  updatePatientEmail,
  setPatientPassword,
} from '@/lib/data/patient';

async function resolveTenantId(session: { tenantId?: string | null }) {
  const tenantContext = await getTenantContext();
  return session.tenantId || tenantContext.tenantId;
}

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

/**
 * GET /api/patients/[id]/app-credentials
 *
 * Returns whether the patient has app credentials (email + password) set.
 * The actual password hash is never returned.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const permissionCheck = await requirePermission(session, 'patients', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    const { id } = await params;
    const tenantId = await resolveTenantId(session);

    const patient = await run(tenantId, () => getPatientByIdWithAuthFields(id));
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        hasPassword: !!patient.password,
        email: patient.email ?? null,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching patient app credentials status', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch credential status' }, { status: 500 });
  }
}

/**
 * POST /api/patients/[id]/app-credentials
 * Staff-only admin override: sets or resets the patient's app login email/password.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    const { id } = await params;
    const tenantId = await resolveTenantId(session);

    let body: { email?: string; password?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
    }

    const password = typeof body.password === 'string' ? body.password : '';
    const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';

    if (!password || password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    const patient = await run(tenantId, () => getPatientByIdWithAuthFields(id));
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }

    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ success: false, error: 'Invalid email format' }, { status: 400 });
      }

      // Cross-tenant conflict check (a patient in any of this patient's
      // tenants using the same email) — must search across tenants.
      const patientTenantIds = patient.tenants.map((t) => t.tenantId);
      for (const tid of patientTenantIds) {
        const conflict = await runAsSystem(() =>
          findPatientAcrossTenantsWithAuthFields({ email, tenantId: tid })
        );
        if (conflict && conflict.id !== patient.id) {
          return NextResponse.json(
            {
              success: false,
              error: 'This email is already registered to another patient in the same clinic.',
            },
            { status: 409 }
          );
        }
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await run(tenantId, () => setPatientPassword(patient.id, passwordHash));
    if (email) {
      await run(tenantId, () => updatePatientEmail(patient.id, email));
    }

    logger.info('Staff set patient app credentials', {
      patientId: id,
      staffId: (session as any).userId,
      emailUpdated: !!email,
    });

    return NextResponse.json({
      success: true,
      message: 'App credentials updated successfully.',
      email: email || patient.email || null,
    });
  } catch (error: any) {
    logger.error('Error setting patient app credentials', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to set credentials' }, { status: 500 });
  }
}
