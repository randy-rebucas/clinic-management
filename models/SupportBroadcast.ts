import mongoose, { Schema, Document, Types } from 'mongoose';
import { MESSAGE_MAX_LENGTH } from '@/lib/messaging';

/** A chat message the platform team broadcast into staff support threads: the console's record of what went out. */
export interface ISupportBroadcast extends Document {
  body: string;
  audience: 'admins' | 'all-staff';
  /** Empty = every active clinic. */
  tenantIds: Types.ObjectId[];
  sentByEmail: string;
  clinics: number;
  recipients: number;
  createdAt: Date;
}

const SupportBroadcastSchema = new Schema<ISupportBroadcast>(
  {
    body: { type: String, required: true, maxlength: MESSAGE_MAX_LENGTH },
    audience: { type: String, enum: ['admins', 'all-staff'], required: true },
    tenantIds: { type: [Schema.Types.ObjectId], ref: 'Tenant', default: [] },
    sentByEmail: { type: String, required: true },
    clinics: { type: Number, default: 0 },
    recipients: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

SupportBroadcastSchema.index({ createdAt: -1 });

export default mongoose.models.SupportBroadcast ||
  mongoose.model<ISupportBroadcast>('SupportBroadcast', SupportBroadcastSchema);
