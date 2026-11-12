import type { Types } from 'mongoose';
import Queue from '@/models/Queue';
import LabResult from '@/models/LabResult';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import { OUTSTANDING } from '@/lib/lab-results';

export interface AtLabEntry {
  _id: string;
  queueNumber: string;
  priority: number;
  patient: { _id: string; firstName: string; lastName: string; patientCode?: string } | null;
  patientName?: string;
  doctor: { firstName: string; lastName: string } | null;
  tests: { _id: string; testType: string; status: string; urgency?: string }[];
}

/**
 * Every patient the doctors have sent out of the queue to the lab ("At lab" on the queue page),
 * with the tests still open for each.
 */
export async function loadPatientsAtLab(tenantId: Types.ObjectId): Promise<AtLabEntry[]> {
  void [Patient, Doctor]; // Models referenced by populate below

  // No awayReason means lab (see models/Queue.ts); 'missed' is "Not here", not the lab.
  const entries = (await Queue.find({ tenantId, status: 'away', awayReason: { $ne: 'missed' } })
    .select('queueNumber patient patientName doctor priority')
    .populate({ path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantId } })
    .populate({ path: 'doctor', select: 'firstName lastName', match: { tenantId } })
    .sort({ priority: -1, queuedAt: 1 })
    .limit(200)
    .lean()) as any[];

  const patientIds = entries.map((e) => e.patient?._id).filter(Boolean);
  const open = patientIds.length
    ? ((await LabResult.find({ tenantId, patient: { $in: patientIds }, status: { $in: OUTSTANDING } })
        .select('patient status request.testType request.urgency')
        .sort({ orderDate: 1 })
        .lean()) as any[])
    : [];
  const testsByPatient = new Map<string, AtLabEntry['tests']>();
  for (const r of open) {
    const key = String(r.patient);
    const list = testsByPatient.get(key) ?? [];
    list.push({ _id: String(r._id), testType: r.request?.testType ?? 'Lab test', status: r.status, urgency: r.request?.urgency });
    testsByPatient.set(key, list);
  }

  return entries.map((e) => ({
    _id: String(e._id),
    queueNumber: e.queueNumber,
    priority: e.priority ?? 0,
    patient: e.patient
      ? { _id: String(e.patient._id), firstName: e.patient.firstName, lastName: e.patient.lastName, patientCode: e.patient.patientCode }
      : null,
    patientName: e.patientName,
    doctor: e.doctor ? { firstName: e.doctor.firstName, lastName: e.doctor.lastName } : null,
    tests: e.patient ? testsByPatient.get(String(e.patient._id)) ?? [] : [],
  }));
}

/**
 * A cheap fingerprint of the tenant's open lab requests (new + at the bench). It changes when a
 * doctor orders a test, the lab receives one, or a result is entered, so the dashboard's other
 * panels know when to refetch. Uses the { tenantId, status, orderDate } index.
 */
export async function openLabRequestsVersion(tenantId: Types.ObjectId): Promise<string> {
  const rows = (await LabResult.find({ tenantId, status: { $in: OUTSTANDING } })
    .select('_id status')
    .sort({ _id: 1 })
    .limit(2000)
    .lean()) as unknown as { _id: unknown; status: string }[];
  return rows.map((r) => `${String(r._id)}:${r.status[0]}`).join(',');
}
