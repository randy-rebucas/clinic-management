import { Types } from 'mongoose';
import Appointment from '@/models/Appointment';
import { dayRangeInTz } from '@/lib/tz';
import { getTenantTimezone } from './shared';

interface UpdateAppointmentFromQueueParams {
  queueId: Types.ObjectId | string;
  patientId: Types.ObjectId | string;
  appointmentId?: Types.ObjectId | string;
  newQueueStatus: string;
  tenantId?: Types.ObjectId;
  skipAutomation?: boolean; // Prevent circular automation
}

const ACTIVE_APPOINTMENT_STATUSES = ['pending', 'scheduled', 'confirmed', 'rescheduled'];

/**
 * Updates appointment status based on queue status changes
 * This maintains data consistency between the queue and appointment systems
 */
export async function updateAppointmentFromQueue(params: UpdateAppointmentFromQueueParams): Promise<void> {
  const { patientId, appointmentId, newQueueStatus, tenantId, skipAutomation } = params;

  if (skipAutomation || !tenantId) {
    return;
  }

  try {
    // Only terminal queue states map onto Appointment's status enum; 'waiting' and
    // 'in-progress' have no appointment equivalent and must not downgrade a confirmation.
    const statusMap: Record<string, string> = {
      completed: 'completed',
      cancelled: 'cancelled',
      'no-show': 'no-show',
    };

    const newAppointmentStatus = statusMap[newQueueStatus];
    if (!newAppointmentStatus) {
      return;
    }

    const query: Record<string, unknown> = {
      tenantId,
      patient: patientId,
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    };

    if (appointmentId) {
      query._id = appointmentId;
    } else {
      // Without a direct link, only touch the patient's appointment for today; never a future one.
      const tz = await getTenantTimezone(tenantId);
      const { start, end } = dayRangeInTz(new Date(), tz);
      query.$or = [
        { appointmentDate: { $gte: start, $lte: end } },
        { scheduledAt: { $gte: start, $lte: end } },
      ];
    }

    await Appointment.findOneAndUpdate(
      query,
      { $set: { status: newAppointmentStatus } },
      { new: true, sort: { appointmentDate: -1, appointmentTime: -1 } }
    );
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
    if (!queueEntry?.tenantId) return null;

    if (queueEntry.appointment) {
      return await Appointment.findOne({ _id: queueEntry.appointment, tenantId: queueEntry.tenantId });
    }

    const tz = await getTenantTimezone(queueEntry.tenantId);
    const { start, end } = dayRangeInTz(new Date(), tz);

    return await Appointment.findOne({
      tenantId: queueEntry.tenantId,
      patient: queueEntry.patient,
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
      $or: [
        { appointmentDate: { $gte: start, $lte: end } },
        { scheduledAt: { $gte: start, $lte: end } },
      ],
    }).sort({ appointmentDate: -1, appointmentTime: -1 });
  } catch (error) {
    console.error('[Appointment Automation] Error finding appointment for queue:', error);
    return null;
  }
}
