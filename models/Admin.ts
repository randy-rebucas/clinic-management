import mongoose, { Schema, Document, Types } from 'mongoose';
import { ensureStaffUser } from './staff-user-link';

export interface IAdmin extends Document {
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;
  
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  
  // Admin-specific information
  title?: string; // Mr., Ms., Dr., etc.
  department?: string;
  accessLevel?: 'full' | 'limited'; // Full access or limited admin access
  
  // Internal notes
  internalNotes?: Array<{
    note: string;
    createdBy: Types.ObjectId;
    createdAt: Date;
    isImportant?: boolean;
  }>;
  
  // Additional profile information
  bio?: string;
  status: 'active' | 'inactive' | 'suspended';
  
  createdAt: Date;
  updatedAt: Date;
}

const AdminSchema: Schema = new Schema(
  {
    // Tenant reference for multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
    },
    
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    phone: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    accessLevel: {
      type: String,
      enum: ['full', 'limited'],
      default: 'full',
    },
    internalNotes: [
      {
        note: { type: String, required: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
        isImportant: { type: Boolean, default: false },
      },
    ],
    bio: {
      type: String,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries (tenant-scoped)
AdminSchema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true }); // Tenant-scoped unique email
AdminSchema.index({ tenantId: 1, status: 1 });
AdminSchema.index({ tenantId: 1, department: 1, status: 1 }); // For department-based queries
AdminSchema.index({ tenantId: 1, accessLevel: 1, status: 1 }); // For access level queries

// Post-save hook to automatically create a User when an Admin is created
// IMPORTANT: Hook must be added BEFORE model registration
AdminSchema.post('save', async function (doc: IAdmin) {
  await ensureStaffUser({
    doc,
    profileField: 'adminProfile',
    roleNames: ['admin'],
    label: 'admin',
  });
});

// Register Admin model immediately to ensure it's available when other models reference it
const AdminModel = mongoose.models.Admin || mongoose.model<IAdmin>('Admin', AdminSchema);

export default AdminModel;

