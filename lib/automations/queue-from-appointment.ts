import { Types } from 'mongoose';
import Queue from '@/models/Queue';

interface UpdateQueueFromAppointmentParams {
  appointmentId: Types.ObjectId | string;
  patientId: Types.ObjectId | string;
  newAppointmentStatus: string;
  queueId?: Types.ObjectId | string;
  tenantId?: Types.ObjectId;
  skipAutomation?: boolean; // Prevent circular automation
}

/**
 * Updates queue status based on appointment status changes
 * This maintains data consistency when appointments are updated directly
 */
export async function updateQueueFromAppointment(params: UpdateQueueFromAppointmentParams): Promise<void> {
  const { appointmentId, patientId, newAppointmentStatus, queueId, tenantId, skipAutomation } = params;

  if (skipAutomation || !tenantId) {
    return;
  }

  try {
    // Only terminal appointment states are pushed to the queue; scheduling changes
    // must not reset an entry that is already being served.
    const statusMap: Record<string, string> = {
      completed: 'completed',
      cancelled: 'cancelled',
      'no-show': 'no-show',
    };

    const newQueueStatus = statusMap[newAppointmentStatus];
    if (!newQueueStatus) {
      return;
    }

    // Only active entries are synced so a finished queue entry is never reopened.
    const query: Record<string, unknown> = {
      tenantId,
      patient: patientId,
      status: { $in: ['waiting', 'in-progress'] },
    };
    if (queueId) {
      query._id = queueId;
    } else {
      query.appointment = appointmentId;
    }

    const updateData: Record<string, unknown> = { status: newQueueStatus };
    if (newQueueStatus === 'completed') {
      updateData.completedAt = new Date();
    }

    await Queue.findOneAndUpdate(query, { $set: updateData }, { new: true, sort: { queuedAt: -1 } });
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
    if (!appointmentEntry?.tenantId) return null;

    return await Queue.findOne({
      tenantId: appointmentEntry.tenantId,
      patient: appointmentEntry.patient,
      status: { $in: ['waiting', 'in-progress'] },
    })
      .sort({ queuedAt: -1 })
      .limit(1);
  } catch (error) {
    console.error('[Queue Automation] Error finding queue for appointment:', error);
    return null;
  }
}
