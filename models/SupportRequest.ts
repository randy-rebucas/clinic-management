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
  /** Reply-to email. Patient requests may have none (phone-only accounts): then `phone` is set. */
  email?: string;
  /** Patient requests: the account holder's mobile number, for a reply by text or call. */
  phone?: string;
  /** Patient requests (eMCR app): the signed-in patient record. */
  patientId?: Types.ObjectId;
  /** What the request is for beyond its category: an eMCR account-deletion request. */
  kind?: 'account-deletion';
  subject: string;
  category: SupportCategory;
  message: string;
  status: SupportStatus;
  /** Where the request came from: the clinic web app, the medical-rep app, or the eMCR patient app. */
  source?: 'clinic' | 'medical-rep' | 'patient';
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
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    // Required except for patient requests, which carry `phone` when the account has no email.
    email: {
      type: String,
      required: function (this: { source?: string }) {
        return this.source !== 'patient';
      },
      index: true,
    },
    phone: { type: String },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient' },
    kind: { type: String, enum: ['account-deletion'] },
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
    },
    source: { type: String, enum: ['clinic', 'medical-rep', 'patient'] },
    replies: { type: [SupportReplySchema], default: [] },
    lastActivityAt: { type: Date },
    lastReplyBy: { type: String, enum: ['platform', 'requester'] },
  },
  { timestamps: true }
);

SupportRequestSchema.index({ status: 1, lastActivityAt: -1 });
SupportRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
SupportRequestSchema.index({ tenantId: 1, email: 1, createdAt: -1 });
// A patient's own requests, and their open account-deletion request (GET/POST deletion-request).
SupportRequestSchema.index({ patientId: 1, kind: 1, createdAt: -1 }, { partialFilterExpression: { patientId: { $exists: true } } });

export default mongoose.models.SupportRequest ||
  mongoose.model<ISupportRequest>('SupportRequest', SupportRequestSchema);
