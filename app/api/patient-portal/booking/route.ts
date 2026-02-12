import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

/**
 * Patient portal - Booking endpoints
 */
export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const patientId = searchParams.get('patientId');

    // Find patient
    const User = (await import('@/models/User')).default;
    const user = await User.findById(session.userId).select('email').lean();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const Patient = (await import('@/models/Patient')).default;
    let patient;
    if (patientId) {
      patient = await Patient.findById(patientId);
    } else {
      patient = await Patient.findOne({ email: (user as any).email });
    }

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build appointment query with tenant filter
    const appointmentQuery: any = { patient: patient._id };
    if (tenantId) {
      appointmentQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      appointmentQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    // Build populate options with tenant filter for doctor
    const doctorPopulateOptions: any = {
      path: 'doctor',
      select: 'firstName lastName specializationId',
      populate: {
        path: 'specializationId',
        select: 'name',
      },
    };
    if (tenantId) {
      doctorPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      doctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    // Build populate options with tenant filter for patient
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName email phone',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantIds: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }] };
    }
    
    // Get patient's appointments
    const appointments = await Appointment.find(appointmentQuery)
      .populate(patientPopulateOptions)
      .populate(doctorPopulateOptions)
      .sort({ appointmentDate: -1 });

    // Get available doctors (tenant-scoped)
    const doctorQuery: any = { status: 'active' };
    if (tenantId) {
      doctorQuery.tenantId = new Types.ObjectId(tenantId);
    } else {
      doctorQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    const doctors = await Doctor.find(doctorQuery)
      .select('firstName lastName specializationId schedule')
      .populate('specializationId', 'name');

    return NextResponse.json({
      success: true,
      data: {
        appointments,
        doctors,
      },
    });
  } catch (error: any) {
    console.error('Error fetching booking data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch booking data' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const body = await request.json();
    const { patientId, doctorId, appointmentDate, appointmentTime, reason } = body;

    // Find patient
    const User = (await import('@/models/User')).default;
    const user = await User.findById(session.userId).select('email').lean();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const Patient = (await import('@/models/Patient')).default;
    let patient;
    if (patientId) {
      patient = await Patient.findById(patientId);
    } else {
      patient = await Patient.findOne({ email: (user as any).email });
    }

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Validate that the doctor belongs to the tenant
    if (doctorId && tenantId) {
      const doctorQuery: any = {
        _id: doctorId,
        tenantId: new Types.ObjectId(tenantId),
      };
      const doctor = await Doctor.findOne(doctorQuery);
      if (!doctor) {
        return NextResponse.json(
          { success: false, error: 'Invalid doctor selected. Please select a doctor from this clinic.' },
          { status: 400 }
        );
      }
    }
    
    // Validate that the patient belongs to the tenant
    if (patient && tenantId) {
      const patientQuery: any = {
        _id: patient._id,
        tenantId: new Types.ObjectId(tenantId),
      };
      const patientCheck = await Patient.findOne(patientQuery);
      if (!patientCheck) {
        return NextResponse.json(
          { success: false, error: 'Invalid patient. Please contact support.' },
          { status: 400 }
        );
      }
    }
    
    // Create appointment (reuse existing appointment creation logic)
    const appointmentData: any = {
      patient: patient._id,
      doctor: doctorId || undefined,
      appointmentDate: new Date(appointmentDate),
      appointmentTime,
      reason: reason || 'Patient portal booking',
      status: 'scheduled',
      source: 'patient_portal',
    };
    
    // Ensure appointment is created with tenantId
    if (tenantId && !appointmentData.tenantId) {
      appointmentData.tenantId = new Types.ObjectId(tenantId);
    }
    
    const appointment = await Appointment.create(appointmentData);
    
    // Build populate options with tenant filter for doctor
    const doctorPopulateOptions: any = {
      path: 'doctor',
      select: 'firstName lastName specializationId',
      populate: {
        path: 'specializationId',
        select: 'name',
      },
    };
    if (tenantId) {
      doctorPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      doctorPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    await appointment.populate(doctorPopulateOptions);
    await appointment.populate('patient', 'firstName lastName patientCode');

    return NextResponse.json({ success: true, data: appointment }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating appointment:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create appointment' },
      { status: 500 }
    );
  }
}

