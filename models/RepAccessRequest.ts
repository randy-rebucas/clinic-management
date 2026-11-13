import mongoose, { Schema, Document, Types } from 'mongoose';

export const REP_ACCESS_STATUSES = ['pending', 'approved', 'declined', 'cancelled'] as const;
export type RepAccessStatus = (typeof REP_ACCESS_STATUSES)[number];

/**
 * A rep asking a clinic that isn't open to all reps to add them to its representatives. The
 * clinic approves (the rep joins its list and can book) or declines.
 */
export interface IRepAccessRequest extends Document {
  /** The clinic (a tenant). */
  tenantId: Types.ObjectId;
  medicalRepresentativeId: Types.ObjectId;
  userId: Types.ObjectId;
  repName: string;
  repCompany?: string;
  message?: string;
  status: RepAccessStatus;
  clinicNote?: string;
  respondedAt?: Date;
  respondedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RepAccessRequestSchema = new Schema<IRepAccessRequest>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    medicalRepresentativeId: { type: Schema.Types.ObjectId, ref: 'MedicalRepresentative', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    repName: { type: String, required: true },
    repCompany: String,
    message: { type: String, maxlength: 500 },
    status: { type: String, enum: REP_ACCESS_STATUSES, default: 'pending' },
    clinicNote: { type: String, maxlength: 1000 },
    respondedAt: Date,
    respondedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// One open request per rep and clinic.
RepAccessRequestSchema.index(
  { tenantId: 1, medicalRepresentativeId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' }, name: 'uniq_pending_rep_access' }
);
// The clinic's list.
RepAccessRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
// The rep's own requests.
RepAccessRequestSchema.index({ userId: 1, status: 1 });

export default mongoose.models.RepAccessRequest || mongoose.model<IRepAccessRequest>('RepAccessRequest', RepAccessRequestSchema);
