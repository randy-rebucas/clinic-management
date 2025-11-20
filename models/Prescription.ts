import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMedication {
  medicineId?: Types.ObjectId; // Reference to Medicine database
  name: string;
  genericName?: string;
  form?: string; // tablet, capsule, syrup
  strength?: string; // e.g. "500 mg"
  dose?: string; // Calculated/actual dose e.g. "500 mg"
  route?: string; // oral, iv, topical
  frequency?: string; // "BID", "TID", "once"
  durationDays?: number;
  quantity?: number; // Total quantity prescribed
  instructions?: string;
  calculatedDosage?: {
    dose: string;
    frequency: string;
    totalDailyDose?: string;
    instructions?: string;
  };
}

export interface IPharmacyDispense {
  pharmacyId?: string;
  pharmacyName?: string;
  dispensedAt?: Date;
  dispensedBy?: string;
  quantityDispensed?: number;
  notes?: string;
  trackingNumber?: string;
}

export interface IPrescription extends Document {
  prescriptionCode: string; // Unique prescription identifier
  visit?: Types.ObjectId;
  patient: Types.ObjectId;
  prescribedBy?: Types.ObjectId;
  issuedAt: Date;
  medications: IMedication[];
  notes?: string;
  status: 'active' | 'completed' | 'cancelled' | 'dispensed' | 'partially-dispensed';
  pharmacyDispenseId?: string; // Legacy - use pharmacyDispenses array
  pharmacyDispenses?: IPharmacyDispense[]; // Track multiple dispensations
  digitalSignature?: {
    providerName: string;
    signatureData: string;
    signedAt: Date;
  };
  printable?: boolean; // Whether prescription is printable
  createdAt: Date;
  updatedAt: Date;
}

const MedicationSchema: Schema = new Schema(
  {
    medicineId: { type: Schema.Types.ObjectId, ref: 'Medicine' },
    name: { type: String, required: true },
    genericName: String,
    form: { type: String }, // tablet, capsule, syrup
    strength: { type: String }, // e.g. "500 mg"
    dose: { type: String }, // Calculated/actual dose e.g. "500 mg"
    route: { type: String }, // oral, iv, topical
    frequency: { type: String }, // "BID", "TID", "once"
    durationDays: { type: Number },
    quantity: { type: Number }, // Total quantity prescribed
    instructions: { type: String },
    calculatedDosage: {
      dose: String,
      frequency: String,
      totalDailyDose: String,
      instructions: String,
    },
  },
  { _id: false }
);

const PharmacyDispenseSchema: Schema = new Schema(
  {
    pharmacyId: String,
    pharmacyName: String,
    dispensedAt: Date,
    dispensedBy: String,
    quantityDispensed: Number,
    notes: String,
    trackingNumber: String,
  },
  { _id: false }
);

const PrescriptionSchema: Schema = new Schema(
  {
    prescriptionCode: { type: String, required: true, unique: true, index: true },
    visit: { type: Schema.Types.ObjectId, ref: 'Visit' },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    prescribedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    issuedAt: { type: Date, default: Date.now },
    medications: [MedicationSchema],
    notes: String,
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled', 'dispensed', 'partially-dispensed'],
      default: 'active',
    },
    pharmacyDispenseId: { type: String }, // Legacy field
    pharmacyDispenses: [PharmacyDispenseSchema],
    digitalSignature: {
      providerName: { type: String },
      signatureData: { type: String },
      signedAt: { type: Date },
    },
    printable: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Indexes for efficient queries
PrescriptionSchema.index({ patient: 1, issuedAt: -1 });
PrescriptionSchema.index({ visit: 1 });
PrescriptionSchema.index({ prescribedBy: 1 });
PrescriptionSchema.index({ status: 1 });
PrescriptionSchema.index({ prescriptionCode: 1 });

export default mongoose.models.Prescription || mongoose.model<IPrescription>('Prescription', PrescriptionSchema);

