import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Tenant from '@/models/Tenant';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { Types } from 'mongoose';
import { getTenantContext } from '@/lib/tenant';
import { isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { checkSubscriptionLimit } from '@/lib/subscription-limits';
import { normalizePhone } from '@/lib/phone';
import { turnstileRejection } from '@/lib/turnstile';
import { patientFieldsSchema, cleanPatientInput, nextPatientCode } from '@/lib/patient-schema';

// Self-registration may only fill in demographic/medical history fields; status, tags,
// segment flags, tenant links, codes and credentials are staff/system controlled.
const publicRegistrationSchema = patientFieldsSchema
  .omit({ active: true, tags: true, segmentFlags: true, discountEligibility: true })
  .extend({
    sex: z.enum(['male', 'female', 'other']).optional(),
    tenantId: z.string().optional(),
    turnstileToken: z.string().max(2048).optional(),
  });

/**
 * Public endpoint for patient self-registration
 * No authentication required - allows patients to register themselves
 * Rate limited to prevent abuse
 */
export async function POST(request: NextRequest) {
  // Apply rate limiting for public endpoint
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.publicWrite);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    await connectDB();

    const parsed = await parseBody(request, publicRegistrationSchema);
    if (isValidationError(parsed)) return parsed;
    const { tenantId: requestedTenantId, turnstileToken, ...fields } = parsed.data;

    const captchaRejected = await turnstileRejection(request, turnstileToken);
    if (captchaRejected) return captchaRejected;

    // Each registration sends a welcome SMS to the submitted number.
    const phone = normalizePhone(fields.phone);
    if (phone) {
      const phoneLimited = await applyRateLimit(request, rateLimiters.publicWritePhone, phone);
      if (phoneLimited) return phoneLimited;
    }

    // The clinic comes from the subdomain; an explicit id is accepted only for an active clinic.
    const ctx = await getTenantContext();
    let tenantObjectId: Types.ObjectId | null = ctx.tenantId ? new Types.ObjectId(ctx.tenantId) : null;
    if (!tenantObjectId && isValidId(requestedTenantId)) {
      const tenant = await Tenant.findOne({ _id: requestedTenantId, status: 'active' }).select('_id').lean() as any;
      if (tenant) tenantObjectId = tenant._id as Types.ObjectId;
    }
    if (!tenantObjectId) {
      return NextResponse.json(
        { success: false, error: 'Clinic not found. Please register through your clinic\'s page.' },
        { status: 400 }
      );
    }

    const limitCheck = await checkSubscriptionLimit(tenantObjectId, 'createPatient');
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { success: false, error: 'This clinic is not accepting online registrations right now. Please contact the clinic.' },
        { status: 403 }
      );
    }

    const data: Record<string, any> = cleanPatientInput(fields);

    if (data.email) {
      const existingPatient = await Patient.exists({ email: data.email, tenantIds: tenantObjectId });
      if (existingPatient) {
        return NextResponse.json(
          // Don't confirm to an anonymous caller that this person is a patient here.
          { success: false, error: 'We could not complete your registration with these details. Please contact the clinic.' },
          { status: 409 }
        );
      }
    } else {
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      data.email = `patient-${Date.now()}-${randomSuffix}@clinic.local`;
    }

    let patient: any;
    for (let attempt = 0; attempt < 3 && !patient; attempt++) {
      try {
        patient = await Patient.create({
          ...data,
          patientCode: await nextPatientCode(),
          tenantIds: [tenantObjectId],
          active: true,
          selfRegistered: true,
        });
      } catch (createError: any) {
        if (createError.code === 11000 && createError.keyPattern?.patientCode) continue;
        throw createError;
      }
    }

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Failed to create patient. Please try again.' },
        { status: 500 }
      );
    }

    logger.info('Public patient registration successful', {
      patientId: patient._id.toString(),
      patientCode: patient.patientCode,
    });

    after(() =>
      import('@/lib/automations/welcome-messages').then(({ sendWelcomeMessage }) => {
        return sendWelcomeMessage({
          patientId: patient._id,
          tenantId: tenantObjectId,
          sendSMS: true,
          sendEmail: true,
          sendNotification: false,
        }).catch((error) => {
          console.error('Error sending welcome message:', error);
        });
      }).catch((error) => {
        console.error('Error loading welcome messages module:', error);
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        _id: patient._id,
        patientCode: patient.patientCode,
        firstName: patient.firstName,
        lastName: patient.lastName,
      },
      message: 'Patient registration successful. Your patient code is: ' + patient.patientCode
    }, { status: 201 });
  } catch (error: any) {
    logger.error('Error in public patient registration', error as Error, {
      name: error.name,
      code: error.code,
    });

    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors || {}).map((err: any) => err.message).join(', ');
      return NextResponse.json(
        { success: false, error: validationErrors || 'Validation error occurred' },
        { status: 400 }
      );
    }

    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'A patient with these details already exists. Please contact the clinic.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to register patient. Please try again or contact the clinic.' },
      { status: 500 }
    );
  }
}
