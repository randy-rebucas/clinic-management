import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { runAsSystem } from '@/lib/tenant-context';
import { getPatientByIdWithAuthFields, getPatientById, updatePatient } from '@/lib/data/patient';

// Fields patients are NOT allowed to update themselves
const BLOCKED_FIELDS = new Set([
  'patientCode',
  'tenantIds',
  'attachments',
  'password',
  'otp',
  'otpExpiry',
  'otpAttempts',
  'active',
  '_id',
  'id',
  '__v',
  'createdAt',
  'updatedAt',
]);

/**
 * GET /api/patients/me
 * Returns the authenticated patient's own profile
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request);

  if (!session) {
    return NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 });
  }

  try {
    const patientWithPw = await runAsSystem(() => getPatientByIdWithAuthFields(session.patientId));

    if (!patientWithPw) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }

    if (patientWithPw.active === false) {
      return NextResponse.json(
        { success: false, error: 'Account is inactive. Please contact the clinic.' },
        { status: 403 }
      );
    }

    // Reuse the full-shape DTO but strip the sensitive hash before sending —
    // only expose a boolean flag, matching the pre-migration `select('+password')`
    // + destructure-and-drop pattern.
    const hasPassword = !!patientWithPw.password;
    const dto = await runAsSystem(() => getPatientById(session.patientId));

    return NextResponse.json({
      success: true,
      data: {
        ...dto,
        hasPassword,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching patient profile', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch profile' }, { status: 500 });
  }
}

/**
 * PATCH /api/patients/me
 * Allows the patient to update their own profile (safe fields only)
 * Blocked: patientCode, tenantIds, attachments, password, otp*, active
 */
export async function PATCH(request: NextRequest) {
  const session = await verifyPatientAuth(request);

  if (!session) {
    return NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 });
  }

  try {
    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: 'Request body must be an object' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!BLOCKED_FIELDS.has(key)) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
    }

    if (typeof updates.email === 'string') {
      updates.email = updates.email.toLowerCase().trim();
    }

    let patient;
    try {
      patient = await runAsSystem(() => updatePatient(session.patientId, updates));
    } catch (error: any) {
      if (error.code === 'P2025') {
        patient = null;
      } else {
        throw error;
      }
    }

    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }

    logger.info('Patient updated own profile', { patientId: session.patientId });

    return NextResponse.json({ success: true, data: patient, message: 'Profile updated successfully' });
  } catch (error: any) {
    logger.error('Error updating patient profile', error as Error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update profile' },
      { status: 500 }
    );
  }
}
