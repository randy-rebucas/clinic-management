import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { z } from 'zod';
import { verifyPatientAuth } from '@/app/lib/patient-auth';

const optionalText = (max: number) => z.string().trim().max(max).optional();

/**
 * Fields a patient may edit about themselves. Everything else (clinical data, tenant
 * membership, login identifiers, auth state) is staff-managed. Primary email/phone and
 * contacts.phone are login identifiers (password / OTP) and change via dedicated flows.
 */
const PatientSelfUpdateSchema = z
  .object({
    contacts: z
      .object({
        email: z.string().trim().toLowerCase().email().max(254).optional(),
        address: optionalText(500),
      })
      .strict()
      .optional(),
    address: z
      .object({
        street: optionalText(200),
        city: optionalText(100),
        state: optionalText(100),
        zipCode: optionalText(20),
      })
      .strict()
      .optional(),
    emergencyContact: z
      .object({
        name: optionalText(200),
        phone: z.string().trim().max(20).regex(/^[+0-9 ()-]*$/, 'Invalid phone number').optional(),
        relationship: optionalText(100),
        relation: optionalText(100),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Flatten parsed input into dotted $set paths so untouched sub-fields are preserved. */
function toSetPaths(input: Record<string, Record<string, string | undefined> | undefined>) {
  const set: Record<string, string> = {};
  for (const [group, fields] of Object.entries(input)) {
    if (!fields) continue;
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) set[`${group}.${key}`] = value;
    }
  }
  return set;
}

/**
 * GET /api/patients/me
 * Returns the authenticated patient's own profile
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request);

  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated. Please login.' },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    // Select password existence flag without exposing the hash
    const patientWithPw = await Patient.findById(session.patientId)
      .select('+password')
      .lean();

    if (!patientWithPw) {
      return NextResponse.json(
        { success: false, error: 'Patient not found.' },
        { status: 404 }
      );
    }

    if ((patientWithPw as any).active === false) {
      return NextResponse.json(
        { success: false, error: 'Account is inactive. Please contact the clinic.' },
        { status: 403 }
      );
    }

    // Strip the actual hash before sending — only expose a boolean flag
    const { password: _pw, otp: _otp, otpExpiry: _otpExpiry, otpAttempts: _otpAttempts, ...safePatient } = patientWithPw as any;

    return NextResponse.json({
      success: true,
      data: {
        ...safePatient,
        hasPassword: !!_pw,
      },
    });
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
 * Allows the patient to update their own contact details, address and emergency contact.
 */
export async function PATCH(request: NextRequest) {
  const session = await verifyPatientAuth(request);

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

    const parsed = PatientSelfUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }

    const updates = toSetPaths(parsed.data);
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const patient = await Patient.findByIdAndUpdate(
      session.patientId,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .select('-otp -otpExpiry -otpAttempts')
      .lean();

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
