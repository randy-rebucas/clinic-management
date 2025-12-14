import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

// Email reminder function (placeholder - implement with your email service)
async function sendAppointmentReminder(appointment: any) {
  const patient = appointment.patient;
  const appointmentDate = new Date(appointment.appointmentDate);
  const appointmentTime = appointment.appointmentTime;
  
  console.log('Sending appointment reminder:', {
    to: patient.email,
    patient: `${patient.firstName} ${patient.lastName}`,
    date: appointmentDate.toLocaleDateString(),
    time: appointmentTime,
  });
  
  // TODO: Implement actual email sending
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read appointments
  const permissionCheck = await requirePermission(session, 'appointments', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    // Build populate options with tenant filter for doctor
    const doctorPopulateOptions: any = {
      path: 'doctor',
      select: 'firstName lastName specialization',
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
      patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    const appointment = await Appointment.findOne(query)
      .populate(patientPopulateOptions)
      .populate(doctorPopulateOptions);
    if (!appointment) {
      return NextResponse.json(
        { success: false, error: 'Appointment not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: appointment });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch appointment' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to update appointments
  const permissionCheck = await requirePermission(session, 'appointments', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    // Build populate options with tenant filter for doctor
    const doctorPopulateOptions: any = {
      path: 'doctor',
      select: 'firstName lastName specialization',
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
      patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }
    
    const appointment = await Appointment.findOneAndUpdate(query, body, {
      new: true,
      runValidators: true,
    })
      .populate(patientPopulateOptions)
      .populate(doctorPopulateOptions);
    if (!appointment) {
      return NextResponse.json(
        { success: false, error: 'Appointment not found' },
        { status: 404 }
      );
    }
    
    // Send reminder if status changed to confirmed
    if (body.status === 'confirmed' && appointment.patient) {
      sendAppointmentReminder(appointment).catch(console.error);
    }
    
    return NextResponse.json({ success: true, data: appointment });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update appointment' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to delete appointments
  const permissionCheck = await requirePermission(session, 'appointments', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const appointment = await Appointment.findOneAndDelete(query);
    if (!appointment) {
      return NextResponse.json(
        { success: false, error: 'Appointment not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to delete appointment' },
      { status: 500 }
    );
  }
}

