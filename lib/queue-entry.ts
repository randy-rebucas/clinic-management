import { Types } from 'mongoose';
import Queue from '@/models/Queue';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { nextQueueNumber } from '@/lib/queue-number';

export type NewQueueEntry = {
  tenantId: string | Types.ObjectId;
  patient: { _id: unknown; firstName: string; lastName: string };
  queueType: 'appointment' | 'walk-in' | 'follow-up';
  appointmentId?: unknown;
  visitId?: unknown;
  doctorId?: unknown;
  roomId?: unknown;
  priority?: number;
  notes?: string;
  /** Set when the patient is already at the clinic (self check-in from the app). */
  checkIn?: { method: 'manual' | 'qr_code' | 'kiosk' | 'app' };
};

/**
 * Seat a patient in a clinic's queue: next number for the clinic-local day, then the check-in QR
 * (which needs the entry's id). Callers check "one live entry per patient" first.
 */
export async function createQueueEntry(input: NewQueueEntry) {
  const tenantObjectId = new Types.ObjectId(String(input.tenantId));
  const tz = await getTenantTimezone(tenantObjectId);
  const queueNumber = await nextQueueNumber(tenantObjectId, input.queueType, tz);
  const now = new Date();

  const queue = await Queue.create({
    tenantId: tenantObjectId,
    queueNumber,
    patient: input.patient._id,
    patientName: `${input.patient.firstName} ${input.patient.lastName}`,
    appointment: input.appointmentId || undefined,
    visit: input.visitId || undefined,
    doctor: input.doctorId || undefined,
    room: input.roomId || undefined,
    queueType: input.queueType,
    priority: input.priority ?? 0,
    notes: input.notes,
    checkedIn: !!input.checkIn,
    checkedInAt: input.checkIn ? now : undefined,
    checkInMethod: input.checkIn?.method,
    status: 'waiting',
  });

  queue.qrCode = JSON.stringify({
    queueId: queue._id.toString(),
    patientId: String(input.patient._id),
    appointmentId: input.appointmentId ? String(input.appointmentId) : null,
    timestamp: now.getTime(),
  });
  await queue.save();
  return queue;
}
