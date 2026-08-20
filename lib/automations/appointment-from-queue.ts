import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getAppointmentById, updateAppointment } from '@/lib/data/appointment';
import prisma from '@/lib/prisma';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

interface UpdateAppointmentFromQueueParams {
  queueId: string;
  patientId: string;
  appointmentId?: string;
  newQueueStatus: string;
  tenantId?: string;
  skipAutomation?: boolean; // Prevent circular automation
}

/**
 * Updates appointment status based on queue status changes
 * This maintains data consistency between the queue and appointment systems
 */
export async function updateAppointmentFromQueue(params: UpdateAppointmentFromQueueParams): Promise<void> {
  const { patientId, appointmentId, newQueueStatus, tenantId, skipAutomation } = params;

  // Prevent circular automation if this was triggered by appointment update
  if (skipAutomation) {
    return;
  }

  try {
    // Map queue status to appointment status. Postgres's AppointmentStatus
    // enum (prisma/schema.prisma) only has pending/scheduled/confirmed/
    // rescheduled/no_show/completed/cancelled — there is no 'in-progress' or
    // 'checked-in' member (unlike the old Mongoose model), so queue
    // 'in-progress' has no valid appointment-status equivalent and is
    // intentionally left unmapped (no-op).
    const statusMap: Record<string, string | undefined> = {
      'waiting': 'scheduled',           // Patient is waiting → appointment is scheduled
      'completed': 'completed',          // Consultation done → appointment completed
      'cancelled': 'cancelled',          // Queue cancelled → appointment cancelled
      'no-show': 'no_show',             // Patient didn't show → appointment no-show
    };

    const newAppointmentStatus = statusMap[newQueueStatus];

    if (!newAppointmentStatus) {
      return;
    }

    await run(tenantId ? String(tenantId) : undefined, async () => {
      // Prepare update data
      const updateData: Record<string, any> = {
        status: newAppointmentStatus,
      };

      // Add timestamps based on status
      if (newAppointmentStatus === 'completed') {
        updateData.completedAt = new Date();
      } else if (newAppointmentStatus === 'cancelled') {
        updateData.cancelledAt = new Date();
      } else if (newAppointmentStatus === 'no_show') {
        updateData.noShowAt = new Date();
      }

      let targetId = appointmentId ? String(appointmentId) : undefined;

      if (!targetId) {
        // Otherwise, find the most recent active appointment for this patient
        const candidate = await prisma.appointment.findFirst({
          where: {
            patientId: String(patientId),
            status: { in: ['scheduled', 'confirmed'] as any },
          },
          orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'desc' }],
          select: { id: true },
        });
        targetId = candidate?.id;
      }

      if (!targetId) {
        return;
      }

      await updateAppointment(targetId, updateData as any);
    });
  } catch (error) {
    console.error('[Appointment Automation] Error updating appointment from queue:', error);
    // Don't throw - we don't want to fail queue operations if appointment update fails
  }
}

/**
 * Checks if a queue entry has an associated appointment
 */
export async function getAppointmentForQueue(queueEntry: any): Promise<any | null> {
  try {
    const tenantId = queueEntry.tenantId ? String(queueEntry.tenantId) : undefined;

    return await run(tenantId, async () => {
      if (queueEntry.appointment) {
        const appointmentId =
          typeof queueEntry.appointment === 'string' ? queueEntry.appointment : queueEntry.appointment?.id ?? queueEntry.appointment?._id;
        return appointmentId ? getAppointmentById(String(appointmentId)) : null;
      }

      // Otherwise, try to find appointment by patient and date
      const patientId =
        typeof queueEntry.patient === 'string' ? queueEntry.patient : queueEntry.patient?.id ?? queueEntry.patient?._id;

      if (!patientId) return null;

      const candidate = await prisma.appointment.findFirst({
        where: {
          patientId: String(patientId),
          status: { in: ['scheduled', 'confirmed'] as any },
        },
        orderBy: [{ appointmentDate: 'desc' }, { appointmentTime: 'desc' }],
        select: { id: true },
      });

      return candidate ? getAppointmentById(candidate.id) : null;
    });
  } catch (error) {
    console.error('[Appointment Automation] Error finding appointment for queue:', error);
    return null;
  }
}
