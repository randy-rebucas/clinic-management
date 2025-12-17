import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export async function GET(request: NextRequest) {
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
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const doctorId = searchParams.get('doctorId');
    const patientId = searchParams.get('patientId');
    const status = searchParams.get('status');
    const isWalkIn = searchParams.get('isWalkIn');
    const room = searchParams.get('room');

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    let query: any = {};
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      query.appointmentDate = { $gte: startOfDay, $lte: endOfDay };
    }
    if (doctorId) {
      query.doctor = doctorId;
    }
    if (patientId) {
      query.patient = patientId;
    }
    if (status) {
      // Support comma-separated statuses
      const statuses = status.split(',');
      query.status = { $in: statuses };
    }
    if (isWalkIn !== null && isWalkIn !== undefined) {
      query.isWalkIn = isWalkIn === 'true';
    }
    if (room) {
      query.room = room;
    }
    
    // Add tenant filter
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
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
      patientPopulateOptions.match = { tenantId: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantId: { $exists: false } }, { tenantId: null }] };
    }

    const appointments = await Appointment.find(query)
      .populate(patientPopulateOptions)
      .populate(doctorPopulateOptions)
      .populate('provider', 'name email')
      .sort({ appointmentDate: 1, appointmentTime: 1 });

    return NextResponse.json({ success: true, data: appointments });
  } catch (error: any) {
    console.error('Error fetching appointments:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch appointments' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to write/create appointments
  const permissionCheck = await requirePermission(session, 'appointments', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const body = await request.json();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Check subscription limit for creating appointments
    if (tenantId) {
      const { checkSubscriptionLimit } = await import('@/lib/subscription-limits');
      const limitCheck = await checkSubscriptionLimit(tenantId, 'createAppointment');
      if (!limitCheck.allowed) {
        return NextResponse.json(
          { 
            success: false, 
            error: limitCheck.reason || 'Subscription limit exceeded',
            limit: limitCheck.limit,
            current: limitCheck.current,
            remaining: limitCheck.remaining,
          },
          { status: 403 }
        );
      }
    }
    
    // Validate that the doctor belongs to the tenant
    if (body.doctor && tenantId) {
      const doctorQuery: any = {
        _id: body.doctor,
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
    if (body.patient && tenantId) {
      const patientQuery: any = {
        _id: body.patient,
        tenantId: new Types.ObjectId(tenantId),
      };
      const patient = await Patient.findOne(patientQuery);
      if (!patient) {
        return NextResponse.json(
          { success: false, error: 'Invalid patient selected. Please select a patient from this clinic.' },
          { status: 400 }
        );
      }

    }
    
    // Get settings for defaults
    const settings = await getSettings();
    
    // Set default duration if not provided
    if (!body.duration) {
      body.duration = settings.appointmentSettings?.defaultDuration || 30;
    }
    
    // Auto-generate appointmentCode if not provided (tenant-scoped)
    if (!body.appointmentCode) {
      const codeQuery: any = { appointmentCode: { $exists: true, $ne: null } };
      if (tenantId) {
        codeQuery.tenantId = new Types.ObjectId(tenantId);
      } else {
        codeQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const lastAppointment = await Appointment.findOne(codeQuery)
        .sort({ appointmentCode: -1 })
        .exec();
      
      let nextNumber = 1;
      if (lastAppointment?.appointmentCode) {
        const match = lastAppointment.appointmentCode.match(/(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }
      
      body.appointmentCode = `APT-${String(nextNumber).padStart(6, '0')}`;
    }
    
    // For walk-ins, ensure queue number is set (tenant-scoped)
    if (body.isWalkIn && !body.queueNumber) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const walkInQuery: any = {
        isWalkIn: true,
        appointmentDate: { $gte: today, $lt: tomorrow },
        status: { $in: ['scheduled', 'confirmed'] },
      };
      if (tenantId) {
        walkInQuery.tenantId = new Types.ObjectId(tenantId);
      } else {
        walkInQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const todayWalkIns = await Appointment.find(walkInQuery).sort({ queueNumber: -1 });
      
      body.queueNumber = todayWalkIns.length > 0 
        ? (todayWalkIns[0].queueNumber || 0) + 1
        : 1;
    }
    
    // Automatically set createdBy to the authenticated user
    const appointmentData: any = {
      ...body,
      createdBy: session.userId,
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
    
    await appointment.populate(patientPopulateOptions);
    await appointment.populate(doctorPopulateOptions);
    
    // Send confirmation email if status is confirmed
    if (appointment.status === 'confirmed' && appointment.patient) {
      // Trigger email reminder (async, don't wait)
      sendAppointmentReminder(appointment).catch(console.error);
    }
    
    // Auto-verify insurance if enabled (async, don't block response)
    if (tenantId && appointment.patient) {
      const { getSettings } = await import('@/lib/settings');
      const settings = await getSettings(tenantId.toString());
      if (settings?.automationSettings?.autoInsuranceVerification) {
        const { autoVerifyInsuranceForAppointment } = await import('@/lib/automations/insurance-verification');
        autoVerifyInsuranceForAppointment(appointment._id, tenantId).catch(console.error);
      }
    }
    
    return NextResponse.json(
      { success: true, data: appointment },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating appointment:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create appointment' },
      { status: 500 }
    );
  }
}

// Email reminder function (placeholder - implement with your email service)
async function sendAppointmentReminder(appointment: any) {
  // This is a placeholder. In production, integrate with:
  // - SendGrid, AWS SES, Nodemailer, etc.
  // - SMS service like Twilio for SMS reminders
  
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
  // Example with Nodemailer:
  // await transporter.sendMail({
  //   from: 'clinic@example.com',
  //   to: patient.email,
  //   subject: 'Appointment Confirmation',
  //   html: `...`
  // });
}

