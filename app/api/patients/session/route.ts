import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import Prescription from '@/models/Prescription';
import LabResult from '@/models/LabResult';
import Invoice from '@/models/Invoice';
import Document from '@/models/Document';
import Referral from '@/models/Referral';
import MobileDevice from '@/models/MobileDevice';
import { Types } from 'mongoose';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import {
  findRefreshTokenSubject,
  readRefreshTokenFromBody,
  revokeRefreshToken,
} from '@/app/lib/refresh-tokens';
import { revokeAllPatientAccess } from '../auth/shared';

// Ensure Doctor model is registered for populate calls
void Doctor;

/**
 * Get patient session data
 * Returns patient profile and related data based on patient session cookie
 */
export async function GET(request: NextRequest) {
  try {
    const sessionData = await verifyPatientAuth(request, { profile: 'ignore' });

    if (!sessionData) return patientAuthError(request);

    await connectDB();

    // Get patient data
    const patient = await Patient.findById(sessionData.patientId);
    
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found.' },
        { status: 404 }
      );
    }

    if (patient.active === false) {
      await recordPatientRefused(patient as any, request, 'access');
      return NextResponse.json(
        { success: false, error: 'Patient account is inactive. Please contact the clinic.' },
        { status: 403 }
      );
    }

    // Get query params for optional data loading
    const searchParams = request.nextUrl.searchParams;
    const include = searchParams.get('include')?.split(',') || [];

    const responseData: any = {
      patient: {
        _id: patient._id,
        patientCode: patient.patientCode,
        firstName: patient.firstName,
        middleName: patient.middleName,
        lastName: patient.lastName,
        suffix: patient.suffix,
        dateOfBirth: patient.dateOfBirth,
        sex: patient.sex,
        email: patient.email,
        phone: patient.phone,
        address: patient.address,
        emergencyContact: patient.emergencyContact,
        allergies: patient.allergies,
        medicalHistory: patient.medicalHistory,
        preExistingConditions: patient.preExistingConditions,
        discountEligibility: patient.discountEligibility,
      },
    };

    // A clinic-scoped session (tid) only sees that clinic; otherwise the patient's first clinic.
    const patientTenantId = sessionData.tid
      ? new Types.ObjectId(sessionData.tid)
      : patient.tenantIds?.[0];

    // Optionally load related data (tenant-scoped)
    if (include.includes('appointments') || include.includes('all')) {
      const appointmentQuery: any = { patient: patient._id };
      if (patientTenantId) {
        appointmentQuery.tenantId = patientTenantId;
      } else {
        appointmentQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const doctorPopulateOptions: any = {
        path: 'doctor',
        select: 'firstName lastName',
      };
      if (patientTenantId) {
        doctorPopulateOptions.match = { tenantId: patientTenantId };
      } else {
        doctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
      }
      
      const appointments = await Appointment.find(appointmentQuery)
        // Staff notes are internal, and video rooms are only handed out inside their join window.
        .select('-notes -createdBy -teleconsult')
        .populate(doctorPopulateOptions)
        .sort({ appointmentDate: -1 })
        .limit(10)
        .lean();
      responseData.appointments = appointments;
    }

    if (include.includes('visits') || include.includes('all')) {
      const visitQuery: any = { patient: patient._id };
      if (patientTenantId) {
        visitQuery.tenantId = patientTenantId;
      } else {
        visitQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const providerPopulateOptions: any = {
        path: 'provider',
        select: 'name email',
      };
      if (patientTenantId) {
        providerPopulateOptions.match = { tenantId: patientTenantId };
      } else {
        providerPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
      }
      
      const visits = await Visit.find(visitQuery)
        .populate(providerPopulateOptions)
        .sort({ date: -1 })
        .limit(10)
        .lean();
      responseData.visits = visits;
    }

    if (include.includes('prescriptions') || include.includes('all')) {
      const prescriptionQuery: any = { patient: patient._id };
      if (patientTenantId) {
        prescriptionQuery.tenantId = patientTenantId;
      } else {
        prescriptionQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const prescribedByPopulateOptions: any = {
        path: 'prescribedBy',
        select: 'name email',
      };
      if (patientTenantId) {
        prescribedByPopulateOptions.match = { tenantId: patientTenantId };
      } else {
        prescribedByPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
      }
      
      const prescriptions = await Prescription.find(prescriptionQuery)
        .populate(prescribedByPopulateOptions)
        .sort({ issuedAt: -1 })
        .limit(10)
        .lean();
      responseData.prescriptions = prescriptions;
    }

    if (include.includes('labResults') || include.includes('all')) {
      const labResultQuery: any = { patient: patient._id };
      if (patientTenantId) {
        labResultQuery.tenantId = patientTenantId;
      } else {
        labResultQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const labResults = await LabResult.find(labResultQuery)
        .sort({ orderDate: -1 })
        .limit(10)
        .lean();
      responseData.labResults = labResults;
    }

    if (include.includes('invoices') || include.includes('all')) {
      const invoiceQuery: any = { patient: patient._id };
      if (patientTenantId) {
        invoiceQuery.tenantId = patientTenantId;
      } else {
        invoiceQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const invoices = await Invoice.find(invoiceQuery)
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
      responseData.invoices = invoices;
    }

    if (include.includes('documents') || include.includes('all')) {
      const documentQuery: any = { 
        patient: patient._id,
        status: 'active',
        isConfidential: { $ne: true } // Don't show confidential documents
      };
      if (patientTenantId) {
        documentQuery.tenantId = patientTenantId;
      } else {
        documentQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const documents = await Document.find(documentQuery)
        .select('documentCode title description category documentType filename size uploadDate')
        .sort({ uploadDate: -1 })
        .limit(20)
        .lean();
      responseData.documents = documents;
    }

    if (include.includes('referrals') || include.includes('all')) {
      const referralQuery: any = { patient: patient._id };
      if (patientTenantId) {
        referralQuery.tenantId = patientTenantId;
      } else {
        referralQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const referringDoctorPopulateOptions: any = {
        path: 'referringDoctor',
        select: 'firstName lastName',
      };
      if (patientTenantId) {
        referringDoctorPopulateOptions.match = { tenantId: patientTenantId };
      } else {
        referringDoctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
      }
      
      const receivingDoctorPopulateOptions: any = {
        path: 'receivingDoctor',
        select: 'firstName lastName',
      };
      if (patientTenantId) {
        receivingDoctorPopulateOptions.match = { tenantId: patientTenantId };
      } else {
        receivingDoctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
      }
      
      const referrals = await Referral.find(referralQuery)
        .populate(referringDoctorPopulateOptions)
        .populate(receivingDoctorPopulateOptions)
        .sort({ referredDate: -1 })
        .limit(10)
        .lean();
      responseData.referrals = referrals;
    }

    return NextResponse.json({
      success: true,
      data: responseData,
    });

  } catch (error: any) {
    logger.error('Error fetching patient session', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch patient data' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/patients/session[?all=true][&deviceId=...]
 * Sign out. Clears the patient_session cookie; a Bearer token stays valid until it expires
 * unless `all=true`, which revokes every token, cookie, login QR and push registration of this
 * patient ("sign out everywhere"). `deviceId` also unregisters that device from push.
 * Optional JSON body `{ refreshToken }` revokes the app's refresh token. When the access token
 * has expired, a still-valid refresh token in the body identifies the patient instead, so
 * `all` / `deviceId` still work.
 */
export async function DELETE(request: NextRequest) {
  const all = request.nextUrl.searchParams.get('all') === 'true';
  const deviceId = request.nextUrl.searchParams.get('deviceId')?.trim();
  const refreshToken = await readRefreshTokenFromBody(request);

  let patientId: string | null = null;
  if (all || deviceId) {
    const session = await verifyPatientAuth(request, { profile: 'ignore' });
    if (session) patientId = session.patientId;
  }

  if (refreshToken) {
    try {
      // Identify the holder before the token is revoked: it is the proof of identity when the
      // access token has already expired.
      if ((all || deviceId) && !patientId) {
        const owner = await findRefreshTokenSubject(refreshToken, 'patient');
        if (owner) {
          await connectDB();
          const patient = await Patient.findById(owner.subjectId)
            .select('sessionVersion')
            .lean<{ sessionVersion?: number } | null>();
          if (patient && (patient.sessionVersion ?? 0) === owner.sessionVersion) patientId = owner.subjectId;
        }
      }
      await revokeRefreshToken(refreshToken, 'patient');
    } catch (error) {
      logger.error('Error revoking patient refresh token', error as Error);
      return NextResponse.json({ success: false, error: 'Failed to sign out' }, { status: 500 });
    }
  }

  if (all || deviceId) {
    if (!patientId) {
      return NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 });
    }
    try {
      await connectDB();
      if (deviceId) {
        await MobileDevice.updateOne(
          { patientId: new Types.ObjectId(patientId), deviceId },
          { $set: { revokedAt: new Date(), pushToken: null } }
        );
      }
      if (all) {
        await revokeAllPatientAccess(patientId);
      }
    } catch (error) {
      logger.error('Error signing patient out', error as Error);
      return NextResponse.json({ success: false, error: 'Failed to sign out' }, { status: 500 });
    }
  }

  const response = NextResponse.json({
    success: true,
    message: all ? 'Signed out on every device' : 'Logged out successfully',
  });

  // Clear the patient session cookie
  response.cookies.set('patient_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });

  return response;
}

