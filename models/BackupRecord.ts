import mongoose, { Schema, Document, Types } from 'mongoose';

export type BackupStatus = 'pending' | 'completed' | 'failed' | 'restoring';

export interface IBackupRecord extends Document {
  tenantId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdByEmail?: string;
  label?: string;
  status: BackupStatus;
  collections: string[];
  totalDocuments: number;
  sizeBytes: number;
  version: string;
  data: Record<string, unknown[]>;
  errorMessage?: string;
  restoredAt?: Date;
  restoredBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BackupRecordSchema = new Schema<IBackupRecord>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByEmail: { type: String },
    label: { type: String, trim: true, maxlength: 200 },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'restoring'],
      default: 'pending',
      index: true,
    },
    collections: [{ type: String }],
    totalDocuments: { type: Number, default: 0 },
    sizeBytes: { type: Number, default: 0 },
    version: { type: String, default: '1.0' },
    data: { type: Schema.Types.Mixed, required: true },
    errorMessage: { type: String },
    restoredAt: { type: Date },
    restoredBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

BackupRecordSchema.index({ tenantId: 1, createdAt: -1 });

export default mongoose.models.BackupRecord ||
  mongoose.model<IBackupRecord>('BackupRecord', BackupRecordSchema);
