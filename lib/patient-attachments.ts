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
