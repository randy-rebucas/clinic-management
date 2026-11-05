import 'server-only';
import type { Types } from 'mongoose';
import Doctor from '@/models/Doctor';
import Queue from '@/models/Queue';
import { consultBlocker } from '@/lib/queue-order';

/** Checks `entry` against the clinic's live consults; see consultBlocker for the rule. */
export async function findConsultBlocker(tenantId: Types.ObjectId, entry: { _id: unknown; doctor?: unknown }) {
  const [inConsult, doctorCount] = await Promise.all([
    Queue.find({ tenantId, status: 'in-progress' }).select('doctor patientName queueNumber').lean(),
    Doctor.countDocuments({ tenantId, status: { $in: ['active', null] } }),
  ]);
  return consultBlocker(entry, inConsult as unknown as Parameters<typeof consultBlocker>[1], doctorCount);
}
