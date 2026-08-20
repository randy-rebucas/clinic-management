import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getQueueById, updateQueueEntry } from '@/lib/data/queue';
import prisma from '@/lib/prisma';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

/**
 * app/api/appointments/[id]/route.ts has not yet been updated to pass a
 * plain string tenantId and still constructs a Mongoose `Types.ObjectId` —
 * accept anything string-coercible here so this module doesn't depend on
 * a Mongo-style driver library.
 */
type IdLike = string | { toString(): string };

interface UpdateQueueFromAppointmentParams {
  appointmentId: string;
  patientId: string;
  newAppointmentStatus: string;
  queueId?: string;
  tenantId?: IdLike;
  skipAutomation?: boolean; // Prevent circular automation
}

/**
 * Updates queue status based on appointment status changes
 * This maintains data consistency when appointments are updated directly
 */
export async function updateQueueFromAppointment(params: UpdateQueueFromAppointmentParams): Promise<void> {
  const { patientId, newAppointmentStatus, queueId, tenantId, skipAutomation } = params;

  // Prevent circular automation if this was triggered by queue update
  if (skipAutomation) {
    return;
  }

  try {
    // Map appointment status to queue status. Normalize the incoming status
    // to hyphenated form first: Postgres's AppointmentStatus enum members are
    // JS-underscored (e.g. 'no_show') while callers historically pass the
    // Mongoose-era hyphenated strings — accept either.
    const normalizedAppointmentStatus = newAppointmentStatus.replace(/_/g, '-');

    const statusMap: Record<string, string> = {
      'scheduled': 'waiting',           // Scheduled → waiting in queue
      'confirmed': 'waiting',            // Confirmed → still waiting
      'checked-in': 'waiting',           // Checked in → waiting to be called
      'in-progress': 'in-progress',      // In progress → being seen
      'completed': 'completed',          // Completed → consultation done
      'cancelled': 'cancelled',          // Cancelled → queue cancelled
      'no-show': 'no-show',             // No-show → patient didn't show
    };

    const newQueueStatus = statusMap[normalizedAppointmentStatus];

    if (!newQueueStatus) {
      return;
    }

    await run(tenantId ? String(tenantId) : undefined, async () => {
      // Prepare update data
      const updateData: Record<string, any> = {
        status: newQueueStatus,
      };

      // Add timestamps based on status
      if (newQueueStatus === 'in-progress') {
        updateData.startedAt = new Date();
        updateData.calledAt = new Date();
      } else if (newQueueStatus === 'completed') {
        updateData.completedAt = new Date();
      } else if (newQueueStatus === 'cancelled') {
        updateData.cancelledAt = new Date();
      }

      let targetId = queueId ? String(queueId) : undefined;

      if (!targetId) {
        // Otherwise, find the most recent active queue entry for this patient
        const candidate = await prisma.queue.findFirst({
          where: {
            patientId: String(patientId),
            status: { in: ['waiting', 'in_progress'] as any },
          },
          orderBy: { queuedAt: 'desc' },
          select: { id: true },
        });
        targetId = candidate?.id;
      }

      if (!targetId) {
        return;
      }

      await updateQueueEntry(targetId, updateData);
    });
  } catch (error) {
    console.error('[Queue Automation] Error updating queue from appointment:', error);
    // Don't throw - we don't want to fail appointment operations if queue update fails
  }
}

/**
 * Checks if an appointment has an associated queue entry
 */
export async function getQueueForAppointment(appointmentEntry: any): Promise<any | null> {
  try {
    const tenantId = appointmentEntry.tenantId ? String(appointmentEntry.tenantId) : undefined;

    return await run(tenantId, async () => {
      const patientId =
        typeof appointmentEntry.patient === 'string'
          ? appointmentEntry.patient
          : appointmentEntry.patient?.id ?? appointmentEntry.patient?._id ?? appointmentEntry.patientId;

      if (!patientId) return null;

      const candidate = await prisma.queue.findFirst({
        where: {
          patientId: String(patientId),
          status: { in: ['waiting', 'in_progress'] as any },
        },
        orderBy: { queuedAt: 'desc' },
        select: { id: true },
      });

      return candidate ? getQueueById(candidate.id) : null;
    });
  } catch (error) {
    console.error('[Queue Automation] Error finding queue for appointment:', error);
    return null;
  }
}
