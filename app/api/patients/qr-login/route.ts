import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

/**
 * Patient QR Code Login
 * Allows patients to login using their QR code
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const { qrCode, tenantId: bodyTenantId } = body;

    if (!qrCode) {
      return NextResponse.json(
        { success: false, error: 'QR code is required' },
        { status: 400 }
      );
    }

    // Parse QR code data
    let qrData;
    try {
      qrData = typeof qrCode === 'string' ? JSON.parse(qrCode) : qrCode;
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid QR code format' },
        { status: 400 }
      );
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

    // Get tenant context from subdomain or body/QR code
    const tenantContext = await getTenantContext();
    const tenantId = bodyTenantId || qrTenantId || tenantContext.tenantId;

    // Find patient by ID or patient code (tenant-scoped)
    let patient;
    if (patientId) {
      const patientQuery: any = { _id: patientId };
      if (tenantId) {
        patientQuery.tenantId = new Types.ObjectId(tenantId);
      } else {
        // If no tenant, check for patients without tenantId (backward compatibility)
        patientQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      patient = await Patient.findOne(patientQuery);
    } else if (patientCode) {
      const patientQuery: any = { patientCode };
      if (tenantId) {
        patientQuery.tenantId = new Types.ObjectId(tenantId);
      } else {
        // If no tenant, check for patients without tenantId (backward compatibility)
        patientQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      patient = await Patient.findOne(patientQuery);
    }

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Verify patient is active
    if (patient.active === false) {
      return NextResponse.json(
        { success: false, error: 'Patient account is inactive. Please contact the clinic.' },
        { status: 403 }
      );
    }

    // Create a patient session cookie
    // Store patient session in a cookie (simpler approach for patient portal)
    const patientSessionData = {
      patientId: patient._id.toString(),
      patientCode: patient.patientCode,
      type: 'patient',
      email: patient.email || `patient-${patient.patientCode}@clinic.local`,
    };

    // Create a response with patient session cookie
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);
    
    const response = NextResponse.json({
      success: true,
      data: {
        patientId: patient._id.toString(),
        patientCode: patient.patientCode,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
      },
      message: 'Login successful',
    });

    // Set patient session cookie (7 days expiration)
    response.cookies.set('patient_session', JSON.stringify(patientSessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expires,
      path: '/',
    });

    logger.info('Patient QR code login successful', {
      patientId: patient._id.toString(),
      patientCode: patient.patientCode,
    });

    return response;

  } catch (error: any) {
    logger.error('Error in patient QR code login', error as Error, {
      name: error.name,
      code: error.code,
    });

    return NextResponse.json(
      { success: false, error: error.message || 'Failed to login with QR code' },
      { status: 500 }
    );
  }
}

