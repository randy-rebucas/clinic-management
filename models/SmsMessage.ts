import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * One text handed to Twilio, so failed sends can be seen. No message bodies: they can name tests
 * and medicines. Only failures are written back by the status webhook, so `sent` means no failure
 * was reported, not that the phone confirmed delivery.
 */
export interface ISmsMessage extends Document {
  tenantId?: Types.ObjectId;
  patientId?: Types.ObjectId;
  template: string;
  category: 'auth' | 'transactional' | 'promotional';
  phoneMasked: string;
  segments: number;
  sid?: string;
  status: 'sent' | 'failed' | 'undelivered';
  errorCode?: string;
  createdAt: Date;
}

const SmsMessageSchema = new Schema<ISmsMessage>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient' },
    template: { type: String, required: true },
    category: { type: String, enum: ['auth', 'transactional', 'promotional'], required: true },
    phoneMasked: { type: String, required: true },
    segments: { type: Number, default: 1 },
    sid: { type: String },
    status: { type: String, enum: ['sent', 'failed', 'undelivered'], default: 'sent' },
    errorCode: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

SmsMessageSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
SmsMessageSchema.index({ patientId: 1 }, { partialFilterExpression: { patientId: { $type: 'objectId' } } });
SmsMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

export default (mongoose.models.SmsMessage as mongoose.Model<ISmsMessage>) ||
  mongoose.model<ISmsMessage>('SmsMessage', SmsMessageSchema);
