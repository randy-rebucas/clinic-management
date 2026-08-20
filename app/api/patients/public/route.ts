import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { runAsSystem } from '@/lib/tenant-context';
import { createPatient, getMaxPatientCodeNumber, patientCodeExists } from '@/lib/data/patient';

/**
 * Public endpoint for patient self-registration
 * No authentication required - allows patients to register themselves
 * Rate limited to prevent abuse.
 */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.public);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    let body: any;
    try {
      body = await request.json();
    } catch (parseError: any) {
      logger.error('Failed to parse request body', parseError as Error);
      return NextResponse.json(
        { success: false, error: 'Invalid request format. Please check your input and try again.' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid request data. Please provide valid patient information.' },
        { status: 400 }
      );
    }

    if (!body.firstName || !body.lastName || !body.phone || !body.dateOfBirth) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: firstName, lastName, phone, and dateOfBirth are required' },
        { status: 400 }
      );
    }

    const tenantId: string | undefined = body.tenantId;
    delete body.tenantId;

    if (body.email && body.email.trim()) {
      const normalizedEmail = body.email.toLowerCase().trim();
      const { findPatientAcrossTenants } = await import('@/lib/data/patient');
      const existingPatient = await runAsSystem(() =>
        findPatientAcrossTenants({ email: normalizedEmail, tenantId })
      );
      if (existingPatient) {
        return NextResponse.json(
          { success: false, error: 'A patient with this email already exists. Please use a different email or contact the clinic.' },
          { status: 409 }
        );
      }
      body.email = normalizedEmail;
    } else {
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      body.email = `patient-${timestamp}-${randomSuffix}@clinic.local`;
    }

    if (!body.patientCode) {
      let patientCode = '';
      let attempts = 0;
      const maxAttempts = 10;
      do {
        attempts++;
        if (attempts > maxAttempts) {
          return NextResponse.json(
            { success: false, error: 'Unable to generate unique patient code. Please try again or contact the clinic.' },
            { status: 500 }
          );
        }
        const nextNumber = (await runAsSystem(() => getMaxPatientCodeNumber())) + attempts;
        patientCode = `CLINIC-${String(nextNumber).padStart(4, '0')}`;
        const exists = await runAsSystem(() => patientCodeExists(patientCode));
        if (!exists) break;
      } while (true);
      body.patientCode = patientCode;
    }

    body.active = body.active !== undefined ? body.active : true;

    let patient;
    let createAttempts = 0;
    const maxCreateAttempts = 5;
    while (createAttempts < maxCreateAttempts) {
      try {
        patient = await runAsSystem(() => createPatient(body, { tenantIds: tenantId ? [tenantId] : [] }));
        break;
      } catch (createError: any) {
        createAttempts++;
        if (createError.code === 'P2002' && createError.meta?.target?.includes?.('patientCode')) {
          if (createAttempts >= maxCreateAttempts) {
            return NextResponse.json(
              { success: false, error: 'Unable to create patient due to code conflict. Please try again.' },
              { status: 500 }
            );
          }
          const nextNumber = (await runAsSystem(() => getMaxPatientCodeNumber())) + createAttempts + 1;
          body.patientCode = `CLINIC-${String(nextNumber).padStart(4, '0')}`;
          continue;
        }
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
      patientId: patient.id,
      patientCode: patient.patientCode,
      email: patient.email,
    });

    import('@/lib/automations/welcome-messages').then(({ sendWelcomeMessage }) => {
      sendWelcomeMessage({
        patientId: patient!.id,
        tenantId,
        sendSMS: true,
        sendEmail: true,
        sendNotification: false,
      }).catch((error) => {
        console.error('Error sending welcome message:', error);
      });
    }).catch((error) => {
      console.error('Error loading welcome messages module:', error);
    });

    return NextResponse.json(
      {
        success: true,
        data: patient,
        message: 'Patient registration successful. Your patient code is: ' + patient.patientCode,
      },
      { status: 201 }
    );
  } catch (error: any) {
    logger.error('Error in public patient registration', error as Error, {
      name: error.name,
      code: error.code,
      message: error.message,
    });

    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] ?? 'field';
      return NextResponse.json(
        { success: false, error: `A patient with this ${field} already exists. Please use a different value or contact the clinic.` },
        { status: 409 }
      );
    }

    const errorMessage = error.message || 'Failed to register patient. Please try again or contact the clinic.';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
