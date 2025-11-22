import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import Appointment from '@/models/Appointment';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';

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
    const searchParams = request.nextUrl.searchParams;
    const doctorId = searchParams.get('doctorId');
    const roomId = searchParams.get('roomId');
    const status = searchParams.get('status') || 'waiting';
    const display = searchParams.get('display') === 'true'; // For TV display

    let query: any = { status: { $in: ['waiting', 'in-progress'] } };
    
    if (doctorId) {
      query.doctor = doctorId;
    }
    if (roomId) {
      query.room = roomId;
    }
    if (status && status !== 'all') {
      query.status = status;
    }

    const queues = await Queue.find(query)
      .populate('patient', 'firstName lastName patientCode')
      .populate('doctor', 'firstName lastName')
      .populate('room', 'name roomNumber')
      .sort({ priority: 1, queuedAt: 1 }) // Priority first, then by time
      .limit(display ? 20 : 100);

    // Calculate estimated wait times
    const queuesWithWaitTime = queues.map((queue: any, index: number) => {
      const estimatedWaitTime = index * 15; // 15 minutes per patient (adjustable)
      return {
        ...queue.toObject(),
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
    return NextResponse.json(
      { success: false, error: 'Failed to fetch queue' },
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

    // Get patient name
    const Patient = (await import('@/models/Patient')).default;
    const patient = await Patient.findById(patientId).select('firstName lastName').lean();
    if (!patient || Array.isArray(patient) || !('firstName' in patient) || !('lastName' in patient)) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    const patientName = `${patient.firstName} ${patient.lastName}`;

    // Generate queue number before creating the queue
    const finalQueueType = queueType || 'appointment';
    const prefix = finalQueueType === 'appointment' ? 'A' : finalQueueType === 'walk-in' ? 'W' : 'F';
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    
    // Count today's queues of this type
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    
    const count = await Queue.countDocuments({
      queueType: finalQueueType,
      queuedAt: { $gte: startOfDay, $lte: endOfDay },
    });
    
    const queueNumber = `${prefix}${dateStr}-${String(count + 1).padStart(3, '0')}`;

    // Generate QR code for check-in
    const qrCodeData = JSON.stringify({
      queueId: null, // Will be set after creation
      patientId,
      appointmentId: appointmentId || null,
      timestamp: Date.now(),
    });

    const queue = await Queue.create({
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
    });

    // Update QR code with actual queue ID
    queue.qrCode = JSON.stringify({
      queueId: queue._id.toString(),
      patientId,
      appointmentId: appointmentId || null,
      timestamp: Date.now(),
    });
    await queue.save();

    await queue.populate('patient', 'firstName lastName patientCode');
    await queue.populate('doctor', 'firstName lastName');
    await queue.populate('room', 'name roomNumber');

    // Log queue creation
    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      action: 'create',
      resource: 'system',
      resourceId: queue._id,
      description: `Added patient to queue: ${queue.queueNumber}`,
    });

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

