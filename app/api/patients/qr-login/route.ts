import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import logger from '@/lib/logger';
import { getTenantContext } from '@/lib/tenant';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { runAsSystem } from '@/lib/tenant-context';
import { findPatientAcrossTenants, getPatientById } from '@/lib/data/patient';

/**
 * Patient QR Code Login
 * Allows patients to login using their QR code
 * Rate limited to prevent brute force attacks
 */
export async function POST(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.auth);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();
    const { qrCode, tenantId: bodyTenantId } = body;

    if (!qrCode) {
      return NextResponse.json({ success: false, error: 'QR code is required' }, { status: 400 });
    }

    let qrData;
    try {
      qrData = typeof qrCode === 'string' ? JSON.parse(qrCode) : qrCode;
    } catch (error) {
      return NextResponse.json({ success: false, error: 'Invalid QR code format' }, { status: 400 });
    }

    const { patientId, patientCode, type, tenantId: qrTenantId } = qrData;

    if (!patientId && !patientCode) {
      return NextResponse.json(
        { success: false, error: 'Patient identification not found in QR code' },
        { status: 400 }
      );
    }

    if (type !== 'patient_login') {
      return NextResponse.json(
        { success: false, error: 'Invalid QR code type. This QR code is not for patient login.' },
        { status: 400 }
      );
    }

    const tenantContext = await getTenantContext();
    const tenantId = bodyTenantId || qrTenantId || tenantContext.tenantId;

    // findPatientAcrossTenants() matches by email/phone/patientCode — a
    // patientId lookup needs a direct id fetch instead, verified against
    // the resolved tenantId afterward (Patient is junction-scoped; see
    // lib/data/patient.ts).
    let patient: Awaited<ReturnType<typeof getPatientById>> | Awaited<ReturnType<typeof findPatientAcrossTenants>> = null;
    if (patientId) {
      const byId = await runAsSystem(() => getPatientById(patientId, { withRelations: false }));
      if (byId && (!tenantId || byId.tenantIds.includes(tenantId))) {
        patient = byId;
      }
    } else {
      patient = await runAsSystem(() => findPatientAcrossTenants({ patientCode, tenantId }));
    }

    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }

    if (patient.active === false) {
      return NextResponse.json(
        { success: false, error: 'Patient account is inactive. Please contact the clinic.' },
        { status: 403 }
      );
    }

    const secretKey = process.env.SESSION_SECRET;
    if (!secretKey) {
      return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
    }
    const encodedKey = new TextEncoder().encode(secretKey);
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const patientJwt = await new SignJWT({
      patientId: patient.id,
      patientCode: patient.patientCode,
      type: 'patient',
      email: patient.email || `patient-${patient.patientCode}@clinic.local`,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(encodedKey);

    const response = NextResponse.json({
      success: true,
      data: {
        patientId: patient.id,
        patientCode: patient.patientCode,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
      },
      message: 'Login successful',
    });

    response.cookies.set('patient_session', patientJwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires,
      path: '/',
    });

    logger.info('Patient QR code login successful', { patientId: patient.id, patientCode: patient.patientCode });

    return response;
  } catch (error: any) {
    logger.error('Error in patient QR code login', error as Error, { name: error.name, code: error.code });

    return NextResponse.json({ success: false, error: 'Failed to login with QR code' }, { status: 500 });
  }
}
