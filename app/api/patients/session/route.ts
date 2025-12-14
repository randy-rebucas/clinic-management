import { NextRequest, NextResponse } from 'next/server';
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
import logger from '@/lib/logger';

// Ensure Doctor model is registered for populate calls
void Doctor;

/**
 * Get patient session data
 * Returns patient profile and related data based on patient session cookie
 */
export async function GET(request: NextRequest) {
  try {
    // Get patient session from cookie
    const sessionCookie = request.cookies.get('patient_session');
    
    if (!sessionCookie?.value) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated. Please login.' },
        { status: 401 }
      );
    }

    let sessionData;
    try {
      sessionData = JSON.parse(sessionCookie.value);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid session. Please login again.' },
        { status: 401 }
      );
    }

    if (!sessionData.patientId || sessionData.type !== 'patient') {
      return NextResponse.json(
        { success: false, error: 'Invalid session type. Please login again.' },
        { status: 401 }
      );
    }

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

    // Get tenantId from patient
    const patientTenantId = patient.tenantId;

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
      { success: false, error: error.message || 'Failed to fetch patient data' },
      { status: 500 }
    );
  }
}

/**
 * Logout patient - clear session cookie
 */
export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully',
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

