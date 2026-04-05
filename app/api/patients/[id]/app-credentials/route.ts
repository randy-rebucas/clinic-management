import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import logger from '@/lib/logger';

/**
 * GET /api/patients/[id]/app-credentials
 *
 * Returns whether the patient has app credentials (email + password) set.
 * Used by the staff UI to show the current credential status.
 * The actual password hash is never returned.
 *
 * Required permission: patients → read
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
    await connectDB();
    const { id } = await params;

    const patient = await Patient.findById(id).select('+password').lean();
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        hasPassword: !!((patient as any).password),
        email: (patient as any).email ?? null,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching patient app credentials status', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch credential status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/patients/[id]/app-credentials
 *
 * Staff-only endpoint. Sets or resets the email and password a patient
 * uses to log into third-party applications.
 *
 * Unlike the patient-self-service endpoint (/api/patients/auth/setup-credentials),
 * this endpoint does NOT require the existing password — it is an admin override.
 *
 * Body: { email?, password }
 *   email    – optional; updates the login email if provided.
 *   password – required; the new password (min 8 chars). Staff should share
 *              this with the patient verbally or via SMS.
 *
 * Required permission: patients → write
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
    await connectDB();
    const { id } = await params;

    let body: { email?: string; password?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    const password = typeof body.password === 'string' ? body.password : '';
    const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';

    if (!password || password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    const patient = await Patient.findById(id);
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Validate and check uniqueness of new email (if provided)
    const updates: Record<string, any> = {};

    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          { success: false, error: 'Invalid email format' },
          { status: 400 }
        );
      }

      const conflict = await Patient.findOne({
        email,
        _id: { $ne: patient._id },
        ...(patient.tenantIds?.length ? { tenantIds: { $in: patient.tenantIds } } : {}),
      }).lean();

      if (conflict) {
        return NextResponse.json(
          {
            success: false,
            error: 'This email is already registered to another patient in the same clinic.',
          },
          { status: 409 }
        );
      }

      updates.email = email;
    }

    updates.password = await bcrypt.hash(password, 12);

    await Patient.updateOne({ _id: patient._id }, { $set: updates });

    logger.info('Staff set patient app credentials', {
      patientId: id,
      staffId: (session as any).userId,
      emailUpdated: !!updates.email,
    });

    return NextResponse.json({
      success: true,
      message: 'App credentials updated successfully.',
      email: updates.email ?? patient.email ?? null,
    });
  } catch (error: any) {
    logger.error('Error setting patient app credentials', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to set credentials' },
      { status: 500 }
    );
  }
}
