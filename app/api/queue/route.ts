import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant } from '@/lib/tenant-context';
import { getPatientById } from '@/lib/data/patient';
import {
  buildQueueWhere,
  countTodayQueueEntries,
  createQueueEntry,
  listQueueEntries,
  setQueueQrCode,
} from '@/lib/data/queue';

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

    let statusFilter: string[] | undefined;
    if (status && status !== 'all') {
      statusFilter = status.includes(',') ? status.split(',') : [status];
    } else {
      statusFilter = ['waiting', 'in-progress'];
    }

    const where = buildQueueWhere({
      status: statusFilter,
      doctorId: doctorId || undefined,
      roomId: roomId || undefined,
    });

    const queues = await runWithTenant(tenantId, () => listQueueEntries(where, display ? 20 : 100));

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
          errorName: error?.name,
        }),
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

    const queue = await runWithTenant(tenantId, async () => {
      // Always validate patient exists first (Patient is junction-scoped, so check tenants explicitly)
      const patient = await getPatientById(patientId);
      const belongsToTenant = patient?.tenantIds?.some((tid: string) => tid === tenantId);
      if (!patient || !belongsToTenant) {
        throw new Object({ status: 404, message: 'Patient not found' });
      }

      const patientName = `${patient.firstName} ${patient.lastName}`;

      // Validate appointment if provided
      const finalQueueType = queueType || 'appointment';
      const prefix = finalQueueType === 'appointment' ? 'A' : finalQueueType === 'walk-in' ? 'W' : 'F';
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      const count = await countTodayQueueEntries({
        queueType: finalQueueType,
        startOfDay,
        endOfDay,
      });

      const queueNumber = `${prefix}${dateStr}-${String(count + 1).padStart(3, '0')}`;

      const created = await createQueueEntry({
        queueNumber,
        patientId,
        patientName,
        appointmentId: appointmentId || undefined,
        visitId: visitId || undefined,
        doctorId: doctorId || undefined,
        roomId: roomId || undefined,
        queueType: finalQueueType,
        priority: priority || 0,
        qrCode: JSON.stringify({ queueId: null, patientId, appointmentId: appointmentId || null, timestamp: Date.now() }),
        checkedIn: false,
        status: 'waiting',
      });

      // Update QR code with actual queue ID
      const updated = await setQueueQrCode(
        created._id,
        JSON.stringify({ queueId: created._id, patientId, appointmentId: appointmentId || null, timestamp: Date.now() })
      );

      return updated;
    });

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

    // NOTE: Auto-optimize queue on join (lib/automations/queue-optimization)
    // is out of scope for this batch (automations remain on Mongoose — see
    // lib/automations/*). Not invoked here to avoid mixing a Mongo-era
    // automation with a Postgres-era queue id.

    return NextResponse.json({ success: true, data: queue }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating queue entry:', error);
    if (error?.status === 404) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create queue entry' },
      { status: 500 }
    );
  }
}
