import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import Appointment from '@/models/Appointment';
import Room from '@/models/Room';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read queue
  const permissionCheck = await requirePermission(session, 'queue', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    
    // Ensure all models are registered (imports ensure this, but double-check)
    if (!mongoose.models.Patient) {
      await import('@/models/Patient');
    }
    if (!mongoose.models.Doctor) {
      await import('@/models/Doctor');
    }
    if (!mongoose.models.Room) {
      await import('@/models/Room');
    }
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || undefined;
    
    // Validate tenantId is present (required for multi-tenant support)
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context is required' },
        { status: 400 }
      );
    }
    
    const searchParams = request.nextUrl.searchParams;
    const doctorId = searchParams.get('doctorId');
    const roomId = searchParams.get('roomId');
    const status = searchParams.get('status') || 'waiting';
    const display = searchParams.get('display') === 'true'; // For TV display

    const query: any = {
      tenantId: new Types.ObjectId(tenantId)
    };
    
    // Handle status filter - support comma-separated values
    if (status && status !== 'all') {
      const statusArray = status.includes(',') ? status.split(',') : [status];
      query.status = { $in: statusArray };
    } else {
      // Default to active statuses if not specified
      query.status = { $in: ['waiting', 'in-progress'] };
    }
    
    if (doctorId) {
      query.doctor = doctorId;
    }
    if (roomId) {
      query.room = roomId;
    }

    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode',
      match: { tenantIds: new Types.ObjectId(tenantId) }
    };
    
    const doctorPopulateOptions: any = {
      path: 'doctor',
      select: 'firstName lastName',
      match: { tenantId: new Types.ObjectId(tenantId) }
    };

    // Find queues - populate will work if models are registered
    const queues = await Queue.find(query)
      .populate(patientPopulateOptions)
      .populate(doctorPopulateOptions)
      .populate('room', 'name roomNumber')
      .sort({ priority: 1, queuedAt: 1 }) // Priority first, then by time
      .limit(display ? 20 : 100)
      .lean();

    // Calculate estimated wait times
    const queuesWithWaitTime = queues.map((queue: any, index: number) => {
      const estimatedWaitTime = index * 15; // 15 minutes per patient (adjustable)
      return {
        ...queue,
        estimatedWaitTime,
        position: index + 1,
      };
    });

    return NextResponse.json({
      success: true,
      data: queuesWithWaitTime,
    });
  } catch (error: any) {
    console.error('Error fetching queue:', error);
    console.error('Error stack:', error?.stack);
    console.error('Error name:', error?.name);
    const errorMessage = error?.message || error?.toString() || 'Failed to fetch queue';
    return NextResponse.json(
      { 
        success: false, 
        error: process.env.NODE_ENV === 'development' ? errorMessage : 'Failed to fetch queue',
        ...(process.env.NODE_ENV === 'development' && { 
          details: error?.stack,
          errorName: error?.name 
        })
      },
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
    const { patientId, appointmentId, visitId, doctorId, roomId, queueType, priority } = body;

    if (!patientId) {
      return NextResponse.json(
        { success: false, error: 'Patient ID required' },
        { status: 400 }
      );
    }

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || undefined;
    
    // Validate tenantId is present (required for multi-tenant support)
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant context is required' },
        { status: 400 }
      );
    }

    // Always validate patient exists first
    const PatientModel = (await import('@/models/Patient')).default;
    const patientQuery: any = { 
      _id: patientId,
      tenantIds: new Types.ObjectId(tenantId) // Check if tenantId is in tenantIds array
    };
    
    const patient = await PatientModel.findOne(patientQuery).select('firstName lastName').lean();
    
    if (!patient || Array.isArray(patient) || !('firstName' in patient) || !('lastName' in patient)) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    const patientName = `${patient.firstName} ${patient.lastName}`;
    
    // Validate appointment if provided
    if (appointmentId) {
      const AppointmentModel = (await import('@/models/Appointment')).default;
      const appointmentQuery: any = { 
        _id: appointmentId,
        tenantId: new Types.ObjectId(tenantId)
      };
      
      const appointment = await AppointmentModel.findOne(appointmentQuery).lean();
      
      if (!appointment) {
        return NextResponse.json(
          { success: false, error: 'Appointment not found' },
          { status: 404 }
        );
      }
    }

    // Generate queue number before creating the queue (tenant-scoped)
    const finalQueueType = queueType || 'appointment';
    const prefix = finalQueueType === 'appointment' ? 'A' : finalQueueType === 'walk-in' ? 'W' : 'F';
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    
    // Count today's queues of this type (tenant-scoped)
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    
    const countQuery: any = {
      tenantId: new Types.ObjectId(tenantId),
      queueType: finalQueueType,
      queuedAt: { $gte: startOfDay, $lte: endOfDay },
    };
    
    const count = await Queue.countDocuments(countQuery);
    
    const queueNumber = `${prefix}${dateStr}-${String(count + 1).padStart(3, '0')}`;

    // Generate QR code for check-in
    const qrCodeData = JSON.stringify({
      queueId: null, // Will be set after creation
      patientId,
      appointmentId: appointmentId || null,
      timestamp: Date.now(),
    });

    const queueData: any = {
      queueNumber,
      patient: patientId,
      patientName,
      appointment: appointmentId || undefined,
      visit: visitId || undefined,
      doctor: doctorId || undefined,
      room: roomId || undefined,
      queueType: finalQueueType,
      priority: priority || 0,
      qrCode: qrCodeData,
      checkedIn: false,
      status: 'waiting',
    };
    
    // Always set tenantId for multi-tenant support
    queueData.tenantId = new Types.ObjectId(tenantId);

    const queue = await Queue.create(queueData);

    // Update QR code with actual queue ID
    queue.qrCode = JSON.stringify({
      queueId: queue._id.toString(),
      patientId,
      appointmentId: appointmentId || null,
      timestamp: Date.now(),
    });
    await queue.save();

    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode',
      match: { tenantIds: new Types.ObjectId(tenantId) }
    };
    
    const doctorPopulateOptions: any = {
      path: 'doctor',
      select: 'firstName lastName',
      match: { tenantId: new Types.ObjectId(tenantId) }
    };
    
    await queue.populate(patientPopulateOptions);
    await queue.populate(doctorPopulateOptions);
    await queue.populate('room', 'name roomNumber');

    // Log queue creation
    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: tenantId,
      action: 'create',
      resource: 'system',
      resourceId: queue._id,
      description: `Added patient to queue: ${queue.queueNumber}`,
    });

    // Auto-optimize queue if enabled (async, don't block response)
    if (tenantId) {
      const { getSettings } = await import('@/lib/settings');
      const settings = await getSettings(tenantId.toString());
      if (settings?.automationSettings?.autoQueueOptimization) {
        const { autoOptimizeQueueOnJoin } = await import('@/lib/automations/queue-optimization');
        autoOptimizeQueueOnJoin(queue._id, tenantId).catch(console.error);
      }
    }

    return NextResponse.json({ success: true, data: queue }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating queue entry:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create queue entry' },
      { status: 500 }
    );
  }
}

