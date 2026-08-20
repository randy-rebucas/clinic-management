import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getQueueById, updateQueueEntry, cancelQueueEntry, getQueueEntryRaw } from '@/lib/data/queue';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'queue', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const queue = await run(tenantId, () => getQueueById(id));

    if (!queue) {
      return NextResponse.json({ success: false, error: 'Queue entry not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: queue });
  } catch (error: any) {
    console.error('[GET /api/queue/[id]] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch queue entry', details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'queue', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Update status timestamps
    if (body.status === 'in-progress' && !body.startedAt) {
      body.startedAt = new Date();
      body.calledAt = body.calledAt || new Date();
    }
    if (body.status === 'completed' && !body.completedAt) {
      body.completedAt = new Date();
    }

    const { oldStatus, updatedQueue } = await run(tenantId, async () => {
      const current = await getQueueEntryRaw(id);
      if (!current) {
        return { oldStatus: null, updatedQueue: null };
      }
      const updated = await updateQueueEntry(id, body);
      return { oldStatus: current.status, updatedQueue: updated };
    });

    if (!updatedQueue) {
      return NextResponse.json({ success: false, error: 'Queue entry not found' }, { status: 404 });
    }

    // Trigger appointment/notification automations if status changed.
    // NOTE: lib/automations/appointment-from-queue.ts and
    // lib/automations/queue-notifications.ts are out of scope for this
    // migration (known gap — see Batch 4 report) and still query Mongoose
    // by ObjectId. queue.id/patient.id/appointment.id are now Postgres
    // UUIDs, so these calls will fail (caught below) rather than crash the
    // request — automations silently no-op until that layer is migrated.
    const newStatus = body.status;
    const skipAutomation = body._skipAutomation === true;

    if (oldStatus !== newStatus && newStatus && !skipAutomation) {
      import('@/lib/automations/appointment-from-queue').then(({ updateAppointmentFromQueue }) => {
        updateAppointmentFromQueue({
          queueId: updatedQueue.id,
          patientId: typeof updatedQueue.patient === 'string' ? updatedQueue.patient : updatedQueue.patient?.id,
          appointmentId: typeof updatedQueue.appointment === 'string' ? updatedQueue.appointment : updatedQueue.appointment?.id,
          newQueueStatus: newStatus,
          tenantId: tenantId ?? undefined,
        } as any).catch((error: any) => {
          console.error('[Queue API] Error in appointment automation:', error);
        });
      }).catch((error) => {
        console.error('[Queue API] Error loading appointment automation module:', error);
      });

      import('@/lib/automations/queue-notifications').then(({ notifyQueuePatient }) => {
        notifyQueuePatient({
          queueId: updatedQueue.id,
          tenantId: tenantId ?? undefined,
          newStatus,
        } as any).catch((error: any) => {
          console.error('[Queue API] Error sending queue notification:', error);
        });
      }).catch((error) => {
        console.error('[Queue API] Error loading queue-notifications module:', error);
      });
    }

    return NextResponse.json({ success: true, data: updatedQueue });
  } catch (error: any) {
    console.error('Error updating queue entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update queue entry' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'queue', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const queue = await run(tenantId, () => cancelQueueEntry(id));

    return NextResponse.json({ success: true, data: queue });
  } catch (error: any) {
    console.error('Error cancelling queue entry:', error);
    if (error.code === 'P2025') {
      return NextResponse.json({ success: false, error: 'Queue entry not found' }, { status: 404 });
    }
    return NextResponse.json(
      { success: false, error: 'Failed to cancel queue entry', details: error.message },
      { status: 500 }
    );
  }
}
