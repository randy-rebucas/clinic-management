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

    // Optionally load related data
    if (include.includes('appointments') || include.includes('all')) {
      const appointments = await Appointment.find({ patient: patient._id })
        .populate('doctor', 'firstName lastName')
        .sort({ appointmentDate: -1 })
        .limit(10)
        .lean();
      responseData.appointments = appointments;
    }

    if (include.includes('visits') || include.includes('all')) {
      const visits = await Visit.find({ patient: patient._id })
        .populate('doctor', 'firstName lastName')
        .sort({ visitDate: -1 })
        .limit(10)
        .lean();
      responseData.visits = visits;
    }

    if (include.includes('prescriptions') || include.includes('all')) {
      const prescriptions = await Prescription.find({ patient: patient._id })
        .populate('doctor', 'firstName lastName')
        .sort({ prescriptionDate: -1 })
        .limit(10)
        .lean();
      responseData.prescriptions = prescriptions;
    }

    if (include.includes('labResults') || include.includes('all')) {
      const labResults = await LabResult.find({ patient: patient._id })
        .sort({ testDate: -1 })
        .limit(10)
        .lean();
      responseData.labResults = labResults;
    }

    if (include.includes('invoices') || include.includes('all')) {
      const invoices = await Invoice.find({ patient: patient._id })
        .sort({ invoiceDate: -1 })
        .limit(10)
        .lean();
      responseData.invoices = invoices;
    }

    if (include.includes('documents') || include.includes('all')) {
      const documents = await Document.find({ 
        patient: patient._id,
        status: 'active',
        isConfidential: { $ne: true } // Don't show confidential documents
      })
        .select('documentCode title description category documentType filename size uploadDate')
        .sort({ uploadDate: -1 })
        .limit(20)
        .lean();
      responseData.documents = documents;
    }

    if (include.includes('referrals') || include.includes('all')) {
      const referrals = await Referral.find({ patient: patient._id })
        .populate('referringDoctor', 'firstName lastName')
        .populate('referredToDoctor', 'firstName lastName')
        .sort({ referralDate: -1 })
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

