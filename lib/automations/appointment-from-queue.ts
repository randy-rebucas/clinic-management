import { Types } from 'mongoose';
import Appointment from '@/models/Appointment';

interface UpdateAppointmentFromQueueParams {
  queueId: Types.ObjectId | string;
  patientId: Types.ObjectId | string;
  appointmentId?: Types.ObjectId | string;
  newQueueStatus: string;
  tenantId?: Types.ObjectId;
  skipAutomation?: boolean; // Prevent circular automation
}

/**
 * Updates appointment status based on queue status changes
 * This maintains data consistency between the queue and appointment systems
 */
export async function updateAppointmentFromQueue(params: UpdateAppointmentFromQueueParams): Promise<void> {
  const { queueId, patientId, appointmentId, newQueueStatus, tenantId, skipAutomation } = params;

  // Prevent circular automation if this was triggered by appointment update
  if (skipAutomation) {
    return;
  }

  try {
    // Map queue status to appointment status
    const statusMap: Record<string, string> = {
      'waiting': 'scheduled',           // Patient is waiting → appointment is scheduled
      'in-progress': 'in-progress',     // Patient is being seen → appointment in progress
      'completed': 'completed',          // Consultation done → appointment completed
      'cancelled': 'cancelled',          // Queue cancelled → appointment cancelled
      'no-show': 'no-show',             // Patient didn't show → appointment no-show
    };

    const newAppointmentStatus = statusMap[newQueueStatus];

    if (!newAppointmentStatus) {
      return;
    }

    // Build query to find the appointment
    const query: any = { patient: patientId };

    // If specific appointmentId provided, use it
    if (appointmentId) {
      query._id = appointmentId;
    } else {
      // Otherwise, find the most recent active appointment for this patient
      query.status = { $in: ['scheduled', 'confirmed', 'checked-in', 'in-progress'] };
    }

    // Add tenant filter
    if (tenantId) {
      query.tenantId = tenantId;
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }

    // Prepare update data
    const updateData: any = {
      status: newAppointmentStatus,
      updatedAt: new Date(),
      _skipAutomation: true, // Flag to prevent circular automation
    };

    // Add timestamps based on status
    if (newAppointmentStatus === 'in-progress') {
      updateData.checkedInAt = updateData.checkedInAt || new Date();
    } else if (newAppointmentStatus === 'completed') {
      updateData.completedAt = new Date();
    } else if (newAppointmentStatus === 'cancelled') {
      updateData.cancelledAt = new Date();
    } else if (newAppointmentStatus === 'no-show') {
      updateData.noShowAt = new Date();
    }

    // Update the appointment
    const updatedAppointment = await Appointment.findOneAndUpdate(
      query,
      updateData,
      { 
        new: true, 
        sort: { appointmentDate: -1, appointmentTime: -1 } // Most recent appointment
      }
    );

    if (updatedAppointment) {
    } else {
    }

  } catch (error) {
    console.error('[Appointment Automation] ❌ Error updating appointment from queue:', error);
    // Don't throw - we don't want to fail queue operations if appointment update fails
  }
}

/**
 * Checks if a queue entry has an associated appointment
 */
export async function getAppointmentForQueue(queueEntry: any): Promise<any | null> {
  try {
    if (queueEntry.appointment) {
      // Queue has direct appointment reference
      return await Appointment.findById(queueEntry.appointment);
    }

    // Otherwise, try to find appointment by patient and date
    const query: any = {
      patient: queueEntry.patient,
      status: { $in: ['scheduled', 'confirmed', 'checked-in', 'in-progress'] },
    };

    if (queueEntry.tenantId) {
      query.tenantId = queueEntry.tenantId;
    }

    const appointment = await Appointment.findOne(query)
      .sort({ appointmentDate: -1, appointmentTime: -1 })
      .limit(1);

    return appointment;
  } catch (error) {
    console.error('[Appointment Automation] Error finding appointment for queue:', error);
    return null;
  }
}
