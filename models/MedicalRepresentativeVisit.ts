import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A rep's visit. Without `clinicId` it is the rep's own log entry (scheduled / completed /
 * cancelled, set freely). With `clinicId` it is booked with a clinic on MyClinicSoft and moves
 * through the clinic's answer: requested → scheduled (approved) or declined, then completed,
 * no-show or cancelled. See lib/rep-visits.ts.
 */
export type RepVisitStatus = 'requested' | 'scheduled' | 'declined' | 'completed' | 'cancelled' | 'no-show';

export interface IMedicalRepresentativeVisit extends Document {
  tenantId?: Types.ObjectId;
  userId: Types.ObjectId;
  medicalRepresentativeId?: Types.ObjectId;
  /** The clinic the visit is booked with; unset for the rep's own log entries. */
  clinicId?: Types.ObjectId;
  clinicName: string;
  clinicLocation: string;
  /** Shared with the clinic. */
  purpose: string;
  date: Date;
  time: string;
  duration: number;
  status: RepVisitStatus;
  /** The rep's private notes; never shown to the clinic. */
  notes?: string;
  /** Products the rep brings or leaves behind; the clinic sees their product sheets. */
  productIds?: Types.ObjectId[];
  /** The clinic's note to the rep: a decline reason, or instructions on approval. */
  clinicNote?: string;
  respondedBy?: Types.ObjectId;
  respondedAt?: Date;
  checkedInAt?: Date;
  checkedInBy?: Types.ObjectId;
  cancelledBy?: 'rep' | 'clinic';
  /** When the day-before push reminder went out (cleared when the date changes). */
  reminderSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MedicalRepresentativeVisitSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    medicalRepresentativeId: {
      type: Schema.Types.ObjectId,
      ref: 'MedicalRepresentative',
      index: true,
    },
    clinicId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
    },
    clinicName: { type: String, required: true, index: true },
    clinicLocation: { type: String, required: true },
    purpose: { type: String, required: true },
    date: { type: Date, required: true, index: true },
    time: { type: String, required: true },
    duration: { type: Number, default: 60 },
    status: {
      type: String,
      enum: ['requested', 'scheduled', 'declined', 'completed', 'cancelled', 'no-show'],
      default: 'scheduled',
      index: true,
    },
    notes: String,
    productIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Product' }], default: undefined },
    clinicNote: { type: String, maxlength: 1000 },
    respondedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    respondedAt: Date,
    checkedInAt: Date,
    checkedInBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledBy: { type: String, enum: ['rep', 'clinic'] },
    reminderSentAt: Date,
  },
  { timestamps: true }
);

MedicalRepresentativeVisitSchema.index({ tenantId: 1, userId: 1, date: -1 });
MedicalRepresentativeVisitSchema.index({ tenantId: 1, clinicName: 'text', clinicLocation: 'text', purpose: 'text' });
// The clinic's rep-visit list and slot capacity checks.
MedicalRepresentativeVisitSchema.index({ clinicId: 1, date: 1, status: 1 }, { partialFilterExpression: { clinicId: { $exists: true } } });

export default mongoose.models.MedicalRepresentativeVisit ||
  mongoose.model<IMedicalRepresentativeVisit>('MedicalRepresentativeVisit', MedicalRepresentativeVisitSchema);
