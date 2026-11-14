import { Types } from 'mongoose';

/**
 * A patient record is shared by every clinic in its `tenantIds`, but a file attached to it belongs
 * to the clinic that uploaded it. Reads, downloads and deletes are limited to the caller's clinic;
 * files without a `tenantId` (uploaded before it was stamped) are shown to no one until
 * scripts/migrate-patient-attachment-tenants.ts assigns them.
 */
export function ownAttachments<T extends { tenantId?: unknown }>(attachments: T[] | undefined | null, tenantId: string | Types.ObjectId): T[] {
  const own = String(tenantId);
  return (attachments ?? []).filter((a) => a.tenantId != null && String(a.tenantId) === own);
}

/** `$elemMatch` / `$pull` condition for one of the clinic's own files. */
export function ownAttachmentMatch(tenantId: string | Types.ObjectId, fileId: string) {
  return { _id: new Types.ObjectId(fileId), tenantId: new Types.ObjectId(String(tenantId)) };
}

type SharedPatientFields = {
  attachments?: Array<{ tenantId?: unknown }> | null;
  guardians?: Array<{ source?: string; tenantId?: unknown }> | null;
  tenantIds?: unknown;
};

/**
 * A whole patient document as one clinic may export it: only that clinic's files, family links
 * the patient made themselves or this clinic made, and no list of the other clinics they attend.
 * Use on every path that hands out the full record (exports, backups).
 */
export function patientRecordForClinic<T extends SharedPatientFields>(patient: T, tenantId: string | Types.ObjectId): Omit<T, 'tenantIds'> {
  const own = String(tenantId);
  const { tenantIds: _tenantIds, ...rest } = patient;
  void _tenantIds;
  const out = { ...rest } as Omit<T, 'tenantIds'> & SharedPatientFields;
  if (patient.attachments !== undefined) out.attachments = ownAttachments(patient.attachments, tenantId);
  if (patient.guardians !== undefined) {
    out.guardians = (patient.guardians ?? []).filter(
      (g) => g.source === 'phone' || (g.tenantId != null && String(g.tenantId) === own)
    );
  }
  return out;
}
