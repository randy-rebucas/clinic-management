import mongoose, { Schema, Document } from 'mongoose';

export interface IDosageRange {
  minAge?: number; // in years
  maxAge?: number; // in years
  minWeight?: number; // in kg
  maxWeight?: number; // in kg
  dose: string; // e.g., "10-20 mg/kg" or "500 mg"
  frequency: string; // e.g., "BID", "TID", "QID"
  maxDailyDose?: string; // e.g., "4 g"
}

export interface IMedicine extends Document {
  name: string;
  genericName?: string;
  brandNames?: string[]; // Common brand names
  form: 'tablet' | 'capsule' | 'syrup' | 'injection' | 'cream' | 'drops' | 'inhaler' | 'other';
  strength: string; // e.g., "500 mg", "250 mg/5ml"
  unit: string; // e.g., "mg", "ml", "units"
  route: 'oral' | 'iv' | 'im' | 'topical' | 'inhalation' | 'ophthalmic' | 'otic' | 'other';
  category: string; // e.g., "Antibiotic", "Analgesic", "Antihypertensive"
  indications: string[]; // What it's used for
  contraindications?: string[]; // When not to use
  sideEffects?: string[]; // Common side effects
  dosageRanges?: IDosageRange[]; // Age/weight-based dosage
  standardDosage?: string; // Standard adult dosage
  standardFrequency?: string; // Standard frequency
  duration?: string; // Typical duration
  requiresPrescription: boolean;
  controlledSubstance?: boolean; // For controlled medications
  schedule?: string; // e.g., "Schedule II", "Schedule III"
  active: boolean; // Whether medication is currently available
  createdAt: Date;
  updatedAt: Date;
}

const DosageRangeSchema: Schema = new Schema(
  {
    minAge: Number,
    maxAge: Number,
    minWeight: Number,
    maxWeight: Number,
    dose: { type: String, required: true },
    frequency: { type: String, required: true },
    maxDailyDose: String,
  },
  { _id: false }
);

const MedicineSchema: Schema = new Schema(
  {
    name: { type: String, required: true, index: true },
    genericName: String,
    brandNames: [String],
    form: {
      type: String,
      enum: ['tablet', 'capsule', 'syrup', 'injection', 'cream', 'drops', 'inhaler', 'other'],
      required: true,
    },
    strength: { type: String, required: true },
    unit: { type: String, required: true },
    route: {
      type: String,
      enum: ['oral', 'iv', 'im', 'topical', 'inhalation', 'ophthalmic', 'otic', 'other'],
      required: true,
    },
    category: { type: String, required: true, index: true },
    indications: [String],
    contraindications: [String],
    sideEffects: [String],
    dosageRanges: [DosageRangeSchema],
    standardDosage: String,
    standardFrequency: String,
    duration: String,
    requiresPrescription: { type: Boolean, default: true },
    controlledSubstance: { type: Boolean, default: false },
    schedule: String,
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Indexes for efficient searching
MedicineSchema.index({ name: 'text', genericName: 'text', brandNames: 'text' });
MedicineSchema.index({ category: 1, active: 1 });

export default mongoose.models.Medicine || mongoose.model<IMedicine>('Medicine', MedicineSchema);

