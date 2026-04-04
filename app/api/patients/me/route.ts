import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { verifyPatientSession } from '@/app/lib/dal';

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
  '__v',
  'createdAt',
  'updatedAt',
]);

/**
 * GET /api/patients/me
 * Returns the authenticated patient's own profile
 */
export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get('patient_session');
  const session = await verifyPatientSession(sessionCookie?.value);

  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated. Please login.' },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    const patient = await Patient.findById(session.patientId).lean();

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found.' },
        { status: 404 }
      );
    }

    if ((patient as any).active === false) {
      return NextResponse.json(
        { success: false, error: 'Account is inactive. Please contact the clinic.' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, data: patient });
  } catch (error: any) {
    logger.error('Error fetching patient profile', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/patients/me
 * Allows the patient to update their own profile (safe fields only)
 * Blocked: patientCode, tenantIds, attachments, password, otp*, active
 */
export async function PATCH(request: NextRequest) {
  const sessionCookie = request.cookies.get('patient_session');
  const session = await verifyPatientSession(sessionCookie?.value);

  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated. Please login.' },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: 'Request body must be an object' },
        { status: 400 }
      );
    }

    // Strip blocked fields
    const updates: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!BLOCKED_FIELDS.has(key)) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Normalize email if provided
    if (typeof updates.email === 'string') {
      updates.email = updates.email.toLowerCase().trim();
    }

    const patient = await Patient.findByIdAndUpdate(
      session.patientId,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found.' },
        { status: 404 }
      );
    }

    logger.info('Patient updated own profile', { patientId: session.patientId });

    return NextResponse.json({
      success: true,
      data: patient,
      message: 'Profile updated successfully',
    });
  } catch (error: any) {
    logger.error('Error updating patient profile', error as Error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors ?? {})
        .map((e: any) => e.message)
        .join(', ');
      return NextResponse.json(
        { success: false, error: messages || 'Validation error' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
