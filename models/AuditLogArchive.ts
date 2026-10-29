import mongoose, { Schema, Types } from 'mongoose';

/**
 * One month of a clinic's audit log, moved out of the database into a private Vercel Blob file
 * (gzipped JSON lines, canonical Extended JSON). Written by lib/audit-archive.ts only after the
 * uploaded file was read back and matched; the entries are deleted from AuditLog after that.
 */
export interface IAuditLogArchive {
  _id: Types.ObjectId;
  /** Absent for platform entries that belong to no clinic (e.g. sign-ins with an unknown email). */
  tenantId?: Types.ObjectId;
  /** Calendar month (UTC) the entries were written in, "YYYY-MM". A month can have several files. */
  month: string;
  pathname: string;
  url: string;
  entries: number;
  bytes: number;
  sha256: string;
  firstAt: Date;
  lastAt: Date;
  createdAt: Date;
}

const AuditLogArchiveSchema = new Schema<IAuditLogArchive>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    month: { type: String, required: true },
    pathname: { type: String, required: true },
    url: { type: String, required: true },
    entries: { type: Number, required: true },
    bytes: { type: Number, required: true },
    sha256: { type: String, required: true },
    firstAt: { type: Date, required: true },
    lastAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogArchiveSchema.index({ tenantId: 1, month: -1 });

export default (mongoose.models.AuditLogArchive as mongoose.Model<IAuditLogArchive>) ||
  mongoose.model<IAuditLogArchive>('AuditLogArchive', AuditLogArchiveSchema);
