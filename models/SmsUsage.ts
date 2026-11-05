import mongoose, { Schema, Document, Types } from 'mongoose';

/** Text segments a clinic used in one clinic-local month ("2026-11"); the plan quota counts these. */
export interface ISmsUsage extends Document {
  tenantId: Types.ObjectId;
  month: string;
  segments: number;
}

const SmsUsageSchema = new Schema<ISmsUsage>({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  month: { type: String, required: true },
  segments: { type: Number, default: 0 },
});

// The unique index is what makes the quota hold: see reserveSmsQuota.
SmsUsageSchema.index({ tenantId: 1, month: 1 }, { unique: true });

export default (mongoose.models.SmsUsage as mongoose.Model<ISmsUsage>) ||
  mongoose.model<ISmsUsage>('SmsUsage', SmsUsageSchema);
