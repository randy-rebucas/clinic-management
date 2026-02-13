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

  // Prevent circular automation if this was triggered by queue update
  if (skipAutomation) {
    console.log('[Queue Automation] ⏭️ Skipping automation (skipAutomation flag set)');
    return;
  }

  try {
    // Map appointment status to queue status
    const statusMap: Record<string, string> = {
      'scheduled': 'waiting',           // Scheduled → waiting in queue
      'confirmed': 'waiting',            // Confirmed → still waiting
      'checked-in': 'waiting',           // Checked in → waiting to be called
      'in-progress': 'in-progress',      // In progress → being seen
      'completed': 'completed',          // Completed → consultation done
      'cancelled': 'cancelled',          // Cancelled → queue cancelled
      'no-show': 'no-show',             // No-show → patient didn't show
    };

    const newQueueStatus = statusMap[newAppointmentStatus];

    if (!newQueueStatus) {
      console.log(`[Queue Automation] No status mapping for appointment status: ${newAppointmentStatus}`);
      return;
    }

    // Build query to find the queue entry
    const query: any = { patient: patientId };

    // If specific queueId provided, use it
    if (queueId) {
      query._id = queueId;
    } else {
      // Otherwise, find the most recent active queue entry for this patient
      query.status = { $in: ['waiting', 'in-progress'] };
    }

    // Add tenant filter
    if (tenantId) {
      query.tenantId = tenantId;
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }

    // Prepare update data
    const updateData: any = {
      status: newQueueStatus,
      updatedAt: new Date(),
      _skipAutomation: true, // Flag to prevent circular automation
    };

    // Add timestamps based on status
    if (newQueueStatus === 'in-progress') {
      updateData.startedAt = updateData.startedAt || new Date();
      updateData.calledAt = updateData.calledAt || new Date();
    } else if (newQueueStatus === 'completed') {
      updateData.completedAt = new Date();
    } else if (newQueueStatus === 'cancelled') {
      updateData.cancelledAt = new Date();
    }

    // Update the queue entry
    const updatedQueue = await Queue.findOneAndUpdate(
      query,
      updateData,
      { 
        new: true, 
        sort: { queuedAt: -1 } // Most recent queue entry
      }
    );

    if (updatedQueue) {
      console.log(`[Queue Automation] ✅ Queue ${updatedQueue._id} status updated to '${newQueueStatus}' (from appointment ${appointmentId})`);
    } else {
      console.log(`[Queue Automation] ℹ️ No active queue entry found for patient ${patientId} (appointment ${appointmentId})`);
    }

  } catch (error) {
    console.error('[Queue Automation] ❌ Error updating queue from appointment:', error);
    // Don't throw - we don't want to fail appointment operations if queue update fails
  }
}

/**
 * Checks if an appointment has an associated queue entry
 */
export async function getQueueForAppointment(appointmentEntry: any): Promise<any | null> {
  try {
    // Try to find queue entry by patient and date
    const query: any = {
      patient: appointmentEntry.patient,
      status: { $in: ['waiting', 'in-progress'] },
    };

    if (appointmentEntry.tenantId) {
      query.tenantId = appointmentEntry.tenantId;
    }

    const queueEntry = await Queue.findOne(query)
      .sort({ queuedAt: -1 })
      .limit(1);

    return queueEntry;
  } catch (error) {
    console.error('[Queue Automation] Error finding queue for appointment:', error);
    return null;
  }
}
