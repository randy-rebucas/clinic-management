import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISpecialization extends Document {
  name: string;
  description?: string;
  category?: string; // e.g., "Surgery", "Medicine", "Diagnostic"
  active: boolean; // Whether specialization is currently available
  createdAt: Date;
  updatedAt: Date;
}

const SpecializationSchema: Schema = new Schema(
  {
    name: { 
      type: String, 
      required: [true, 'Specialization name is required'], 
      trim: true,
      index: true,
      unique: true, // Globally unique - specializations are shared across all tenants
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      index: true,
    },
    active: { 
      type: Boolean, 
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Indexes for efficient searching (global)
SpecializationSchema.index({ name: 'text' });
SpecializationSchema.index({ category: 1, active: 1 });

export default mongoose.models.Specialization || mongoose.model<ISpecialization>('Specialization', SpecializationSchema);
