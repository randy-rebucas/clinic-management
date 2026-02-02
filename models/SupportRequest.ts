import mongoose, { Schema, Document, Types } from 'mongoose';

export type SupportCategory =
  | 'general'
  | 'technical'
  | 'billing'
  | 'account'
  | 'onboarding'
  | 'other';

export type SupportStatus = 'open' | 'in-progress' | 'resolved' | 'closed';

export interface ISupportRequest extends Document {
  tenantId?: Types.ObjectId;
  userId?: Types.ObjectId;
  email: string;
  subject: string;
  category: SupportCategory;
  message: string;
  status: SupportStatus;
  createdAt: Date;
  updatedAt: Date;
}

const SupportRequestSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    email: { type: String, required: true, index: true },
    subject: { type: String, required: true },
    category: {
      type: String,
      enum: ['general', 'technical', 'billing', 'account', 'onboarding', 'other'],
      default: 'general',
      index: true,
    },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ['open', 'in-progress', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },
  },
  { timestamps: true }
);

SupportRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
SupportRequestSchema.index({ tenantId: 1, email: 1, createdAt: -1 });

export default mongoose.models.SupportRequest ||
  mongoose.model<ISupportRequest>('SupportRequest', SupportRequestSchema);
