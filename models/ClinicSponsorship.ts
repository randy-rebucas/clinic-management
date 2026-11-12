import mongoose, { Schema, Document, Types } from 'mongoose';

export const SPONSORSHIP_STATUSES = ['pending', 'accepted', 'declined', 'cancelled', 'ended'] as const;
export type SponsorshipStatus = (typeof SPONSORSHIP_STATUSES)[number];
/** Statuses a clinic can have only one of at a time. */
export const OPEN_SPONSORSHIP_STATUSES: SponsorshipStatus[] = ['pending', 'accepted'];

/**
 * A medical rep paying for a clinic's subscription (lib/clinic-sponsorship.ts).
 *
 * Either side starts it (`initiatedBy`); the other side accepts. While `accepted` the rep can pay
 * for 1, 3, 6 or 12 months at a time; each payment extends the clinic's plan through the normal
 * subscription path and is listed in `payments`. `ended` (by either side) stops further payments;
 * time already paid for stays with the clinic. `declined` / `cancelled` close a request that was
 * never accepted.
 */
export interface IClinicSponsorship extends Document {
  tenantId: Types.ObjectId;
  repId: Types.ObjectId;
  /** The rep's User, so the rep's session can find it directly. */
  repUserId: Types.ObjectId;
  initiatedBy: 'clinic' | 'rep';
  initiatedByUserId: Types.ObjectId;
  message?: string;
  status: SponsorshipStatus;
  respondedAt?: Date;
  respondedBy?: Types.ObjectId;
  endedAt?: Date;
  endedBy?: 'clinic' | 'rep';
  /** `refundedAt`: PayMongo refunded it (or it was charged back); its months came off the plan. */
  payments: Array<{ orderId: string; paymentId: string; months: number; amount: number; paidAt: Date; refundedAt?: Date }>;
  /** The clinic's paid-until date after the latest payment. */
  paidThrough?: Date;
  /** Paid-through date the renewal reminder was sent for (one reminder per period). */
  reminderSentFor?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ClinicSponsorshipSchema = new Schema<IClinicSponsorship>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    repId: { type: Schema.Types.ObjectId, ref: 'MedicalRepresentative', required: true },
    repUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    initiatedBy: { type: String, enum: ['clinic', 'rep'], required: true },
    initiatedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: SPONSORSHIP_STATUSES, default: 'pending', required: true },
    respondedAt: Date,
    respondedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    endedAt: Date,
    endedBy: { type: String, enum: ['clinic', 'rep'] },
    payments: [
      {
        orderId: { type: String, required: true },
        paymentId: { type: String, required: true },
        months: { type: Number, required: true },
        amount: { type: Number, required: true },
        paidAt: { type: Date, default: Date.now },
        refundedAt: Date,
        _id: false,
      },
    ],
    paidThrough: Date,
    reminderSentFor: Date,
  },
  { timestamps: true }
);

ClinicSponsorshipSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
ClinicSponsorshipSchema.index({ repUserId: 1, status: 1, createdAt: -1 });
// One open (pending or accepted) sponsorship per clinic.
ClinicSponsorshipSchema.index(
  { tenantId: 1 },
  { unique: true, name: 'one_open_per_clinic', partialFilterExpression: { status: { $in: OPEN_SPONSORSHIP_STATUSES } } }
);
// The renewal reminder cron.
ClinicSponsorshipSchema.index({ status: 1, paidThrough: 1 });

export default (mongoose.models.ClinicSponsorship as mongoose.Model<IClinicSponsorship>) ||
  mongoose.model<IClinicSponsorship>('ClinicSponsorship', ClinicSponsorshipSchema);
