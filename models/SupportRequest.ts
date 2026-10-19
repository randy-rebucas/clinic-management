import mongoose, { Schema, Document, Types } from 'mongoose';

export type SupportCategory =
  | 'general'
  | 'technical'
  | 'billing'
  | 'account'
  | 'onboarding'
  | 'other';

export type SupportStatus = 'open' | 'in-progress' | 'resolved' | 'closed';

/** Who wrote a reply: the platform team, or the person who opened the request. */
export type SupportReplyAuthor = 'platform' | 'requester';

export interface ISupportReply {
  _id: Types.ObjectId;
  authorType: SupportReplyAuthor;
  authorEmail: string;
  message: string;
  createdAt: Date;
}

export interface ISupportRequest extends Document {
  tenantId?: Types.ObjectId;
  userId?: Types.ObjectId;
  email: string;
  subject: string;
  category: SupportCategory;
  message: string;
  status: SupportStatus;
  /** Where the request came from: the clinic web app or the medical-rep app. */
  source?: 'clinic' | 'medical-rep';
  replies: ISupportReply[];
  /** Last message from either side; the platform queue sorts on it. */
  lastActivityAt?: Date;
  /** Who spoke last, so the queue can show requests waiting on the platform team. */
  lastReplyBy?: SupportReplyAuthor;
  createdAt: Date;
  updatedAt: Date;
}

const SupportReplySchema = new Schema(
  {
    authorType: { type: String, enum: ['platform', 'requester'], required: true },
    authorEmail: { type: String, required: true },
    message: { type: String, required: true, maxlength: 10000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

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
    source: { type: String, enum: ['clinic', 'medical-rep'] },
    replies: { type: [SupportReplySchema], default: [] },
    lastActivityAt: { type: Date },
    lastReplyBy: { type: String, enum: ['platform', 'requester'] },
  },
  { timestamps: true }
);

SupportRequestSchema.index({ status: 1, lastActivityAt: -1 });
SupportRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
SupportRequestSchema.index({ tenantId: 1, email: 1, createdAt: -1 });

export default mongoose.models.SupportRequest ||
  mongoose.model<ISupportRequest>('SupportRequest', SupportRequestSchema);
