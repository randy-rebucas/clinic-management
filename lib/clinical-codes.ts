import { Types } from 'mongoose';
import Prescription from '@/models/Prescription';
import Visit from '@/models/Visit';
import { nextSequence, formatCode, maxCodeSeed } from '@/lib/counters';

/**
 * Per-tenant document codes. Counter keys are shared with any automation that allocates
 * the same kind of code, so both paths draw from one sequence.
 */
const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));

/** RX-000123 (counter key 'prescription'). */
export async function nextPrescriptionCode(tenantId: string | Types.ObjectId): Promise<string> {
  const tid = oid(tenantId);
  const seq = await nextSequence(
    tid,
    'prescription',
    maxCodeSeed(Prescription, 'prescriptionCode', { tenantId: tid, prescriptionCode: { $exists: true, $ne: null } })
  );
  return formatCode('RX', seq);
}

/** VISIT-000123 (counter key 'visit'). */
export async function nextVisitCode(tenantId: string | Types.ObjectId): Promise<string> {
  const tid = oid(tenantId);
  const seq = await nextSequence(
    tid,
    'visit',
    maxCodeSeed(Visit, 'visitCode', { tenantId: tid, visitCode: { $exists: true, $ne: null } })
  );
  return formatCode('VISIT', seq);
}
