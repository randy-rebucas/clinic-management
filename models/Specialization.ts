import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISpecialization extends Document {
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;
  
  name: string;
  description?: string;
  category?: string; // e.g., "Surgery", "Medicine", "Diagnostic"
  active: boolean; // Whether specialization is currently available
  createdAt: Date;
  updatedAt: Date;
}

const SpecializationSchema: Schema = new Schema(
  {
    // Tenant reference for multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    
    name: { 
      type: String, 
      required: [true, 'Specialization name is required'], 
      trim: true,
      index: true,
      unique: false, // Not unique globally, but should be unique per tenant
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

// Compound index for tenant-scoped uniqueness
SpecializationSchema.index({ tenantId: 1, name: 1 }, { unique: true });

// Indexes for efficient searching (tenant-scoped)
SpecializationSchema.index({ tenantId: 1, name: 'text' });
SpecializationSchema.index({ tenantId: 1, category: 1, active: 1 });
SpecializationSchema.index({ tenantId: 1, active: 1 }); // For active specialization queries

export default mongoose.models.Specialization || mongoose.model<ISpecialization>('Specialization', SpecializationSchema);
