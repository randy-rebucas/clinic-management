import { after } from 'next/server';
import type { Types } from 'mongoose';
import Queue from '@/models/Queue';
import { getSettings } from '@/lib/settings';
import { findConsultBlocker } from '@/lib/queue-consult';
import { QUEUE_SORT, shortQueueNumber, type NextCalled } from '@/lib/queue-order';

/**
 * Calls in the next patient once a consult has ended, when the clinic has turned this on. `doctor`
 * is the line that just came free (none for the unassigned line). A doctor with an empty line takes
 * the next unassigned patient; the unassigned line never takes a doctor's patient. Patients who
 * haven't checked in are passed over. Never throws: the consult has already ended by now.
 */
export async function callNextPatient(tenantId: Types.ObjectId, doctor?: Types.ObjectId | null): Promise<NextCalled | null> {
  try {
    // Not automationEnabled(): that counts a clinic with no stored value as on.
    const settings = await getSettings(tenantId.toString());
    if (settings?.automationSettings?.autoCallNextPatient !== true) return null;

    const firstIn = (line: Types.ObjectId | null) =>
      Queue.findOne({ tenantId, status: 'waiting', checkedIn: true, doctor: line }).sort(QUEUE_SORT).select('_id').lean() as Promise<{ _id: Types.ObjectId } | null>;
    const next = (await firstIn(doctor ?? null)) ?? (doctor ? await firstIn(null) : null);
    if (!next) return null;

    if (await findConsultBlocker(tenantId, { _id: next._id, doctor })) return null;

    // Only while still waiting, so a desk clicking Call in at the same moment wins cleanly.
    const now = new Date();
    const called = await Queue.findOneAndUpdate(
      { _id: next._id, tenantId, status: 'waiting' },
      { $set: { status: 'in-progress', startedAt: now, calledAt: now, ...(doctor ? { doctor } : {}) } },
      { new: true }
    ).lean() as { _id: Types.ObjectId; patientName: string; queueNumber: string } | null;
    if (!called) return null;

    after(() =>
      import('@/lib/automations/queue-notifications')
        .then(({ notifyQueuePatient }) => notifyQueuePatient({ queueId: called._id, tenantId, newStatus: 'in-progress' }))
        .catch((error) => console.error('[queue-auto-call] Error sending the call-in notification:', error))
    );

    return { name: called.patientName, number: shortQueueNumber(called.queueNumber) };
  } catch (error) {
    // Lost the race on uniq_tenant_doctor_in_consult: someone was called in first, which is fine.
    if ((error as { code?: number }).code !== 11000) console.error('[queue-auto-call] Error calling the next patient:', error);
    return null;
  }
}
