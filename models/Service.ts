import mongoose, { Schema, Document } from 'mongoose';

export interface IService extends Document {
  code: string; // Service code (e.g., CONSULT-001, PROC-001)
  name: string; // Service name
  description?: string;
  category: 'consultation' | 'procedure' | 'laboratory' | 'imaging' | 'medication' | 'other';
  type?: string; // e.g., "General Consultation", "Follow-up", "X-Ray", "Blood Test"
  unitPrice: number;
  unit: string; // e.g., "per visit", "per procedure", "per test"
  duration?: number; // Duration in minutes (for procedures)
  requiresDoctor?: boolean; // Whether service requires a doctor
  active: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ServiceSchema: Schema = new Schema(
  {
    code: {
      type: String,
      required: [true, 'Service code is required'],
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Service name is required'],
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: ['consultation', 'procedure', 'laboratory', 'imaging', 'medication', 'other'],
      required: true,
      index: true,
    },
    type: {
      type: String,
      trim: true,
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: 0,
    },
    unit: {
      type: String,
      default: 'per service',
      trim: true,
    },
    duration: {
      type: Number, // Duration in minutes
      min: 0,
    },
    requiresDoctor: {
      type: Boolean,
      default: false,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

// Indexes for efficient queries
ServiceSchema.index({ category: 1, active: 1 });
ServiceSchema.index({ name: 'text', description: 'text' });
ServiceSchema.index({ active: 1 }); // For active service queries
ServiceSchema.index({ requiresDoctor: 1, active: 1 }); // For doctor-required services
ServiceSchema.index({ code: 1 }); // Additional index for code lookups (unique already creates one)

export default mongoose.models.Service || mongoose.model<IService>('Service', ServiceSchema);

