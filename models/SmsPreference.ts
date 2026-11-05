import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * What one phone number agreed to. Kept by number, not by patient, because a family can share a
 * number and an opt-out must survive the record being erased. No `tenantId` means every clinic.
 */
export interface ISmsPreference extends Document {
  phoneE164: string;
  tenantId?: Types.ObjectId | null;
  optedOut: boolean;
  promoOptIn: boolean;
  source: 'link' | 'staff' | 'app' | 'reply' | 'booking' | 'registration';
  updatedAt: Date;
}

const SmsPreferenceSchema = new Schema<ISmsPreference>(
  {
    phoneE164: { type: String, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
    optedOut: { type: Boolean, default: false },
    promoOptIn: { type: Boolean, default: false },
    source: { type: String, enum: ['link', 'staff', 'app', 'reply', 'booking', 'registration'], required: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

SmsPreferenceSchema.index({ phoneE164: 1, tenantId: 1 }, { unique: true });
SmsPreferenceSchema.index({ tenantId: 1 });

export default (mongoose.models.SmsPreference as mongoose.Model<ISmsPreference>) ||
  mongoose.model<ISmsPreference>('SmsPreference', SmsPreferenceSchema);
