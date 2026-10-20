import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A message the clinic sent to a patient (a doctor's note, a clinic announcement). Shown in the
 * patient app's notification feed next to the notices derived from appointments and results,
 * and pushed to the patient's devices. Read state lives with the feed's (Patient.readNotificationIds).
 */
export interface IPatientMessage extends Document {
  tenantId: Types.ObjectId;
  patient: Types.ObjectId;
  kind: 'message' | 'announcement';
  title: string;
  message: string;
  sender: {
    kind: 'staff' | 'clinic';
    userId?: Types.ObjectId;
    name?: string;
    role?: string;
  };
  /** Groups the copies of one announcement, for history and counts. */
  batchId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PatientMessageSchema = new Schema<IPatientMessage>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    kind: { type: String, enum: ['message', 'announcement'], default: 'message' },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 2000 },
    sender: {
      kind: { type: String, enum: ['staff', 'clinic'], required: true },
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      name: { type: String, maxlength: 200 },
      role: { type: String, maxlength: 50 },
    },
    batchId: { type: String },
  },
  { timestamps: true }
);

PatientMessageSchema.index({ patient: 1, tenantId: 1, createdAt: -1 });
PatientMessageSchema.index({ tenantId: 1, createdAt: -1 });
// The feed shows 90 days; keep a year for the clinic's record of what was sent.
PatientMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export default mongoose.models.PatientMessage ||
  mongoose.model<IPatientMessage>('PatientMessage', PatientMessageSchema);
