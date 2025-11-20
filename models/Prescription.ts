import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMedication {
  name: string;
  form?: string; // tablet, capsule, syrup
  dose?: string; // e.g. "500 mg"
  route?: string; // oral, iv, topical
  frequency?: string; // "BID", "TID", "once"
  durationDays?: number;
  instructions?: string;
}

export interface IPrescription extends Document {
  visit?: Types.ObjectId;
  patient: Types.ObjectId;
  prescribedBy?: Types.ObjectId;
  issuedAt: Date;
  medications: IMedication[];
  notes?: string;
  status: 'active' | 'completed' | 'cancelled' | 'dispensed';
  pharmacyDispenseId?: string; // optional mapping
  createdAt: Date;
  updatedAt: Date;
}

const MedicationSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    form: { type: String }, // tablet, capsule, syrup
    dose: { type: String }, // e.g. "500 mg"
    route: { type: String }, // oral, iv, topical
    frequency: { type: String }, // "BID", "TID", "once"
    durationDays: { type: Number },
    instructions: { type: String },
  },
  { _id: false }
);

const PrescriptionSchema: Schema = new Schema(
  {
    visit: { type: Schema.Types.ObjectId, ref: 'Visit' },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    prescribedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    issuedAt: { type: Date, default: Date.now },
    medications: [MedicationSchema],
    notes: String,
    status: { type: String, enum: ['active', 'completed', 'cancelled', 'dispensed'], default: 'active' },
    pharmacyDispenseId: { type: String }, // optional mapping
  },
  { timestamps: true }
);

// Indexes for efficient queries
PrescriptionSchema.index({ patient: 1, issuedAt: -1 });
PrescriptionSchema.index({ visit: 1 });
PrescriptionSchema.index({ prescribedBy: 1 });
PrescriptionSchema.index({ status: 1 });

export default mongoose.models.Prescription || mongoose.model<IPrescription>('Prescription', PrescriptionSchema);

