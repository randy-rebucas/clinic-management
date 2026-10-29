import mongoose, { Schema, Document, Types } from 'mongoose';
import { ensureStaffUser } from './staff-user-link';

/** Laboratory staff: receives the doctors' lab requests and enters the results. */
export interface IMedicalTechnologist extends Document {
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;

  firstName: string;
  lastName: string;
  email: string;
  phone: string;

  employeeId?: string;
  department?: string; // e.g., 'Hematology', 'Clinical chemistry'
  hireDate?: Date;
  address?: string;

  // Professional information
  title?: string; // e.g., 'RMT'
  specialization?: string;
  licenseNumber?: string; // PRC licence

  // Emergency contact
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };

  // Internal notes (staff-only)
  internalNotes?: Array<{
    note: string;
    createdBy: Types.ObjectId;
    createdAt: Date;
    isImportant?: boolean;
  }>;

  bio?: string;
  status: 'active' | 'inactive' | 'on-leave';

  createdAt: Date;
  updatedAt: Date;
}

const MedicalTechnologistSchema: Schema = new Schema(
  {
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
      required: [true, 'Phone number is required'],
      trim: true,
    },
    employeeId: { type: String, trim: true },
    department: { type: String, trim: true },
    hireDate: { type: Date },
    address: { type: String, trim: true },
    title: { type: String, trim: true },
    specialization: { type: String, trim: true },
    licenseNumber: { type: String, trim: true },
    emergencyContact: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      relationship: { type: String, trim: true },
    },
    internalNotes: [
      {
        note: { type: String, required: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
        isImportant: { type: Boolean, default: false },
      },
    ],
    bio: { type: String },
    status: {
      type: String,
      enum: ['active', 'inactive', 'on-leave'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries (tenant-scoped)
MedicalTechnologistSchema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
MedicalTechnologistSchema.index({ tenantId: 1, employeeId: 1 }, { sparse: true });
MedicalTechnologistSchema.index({ tenantId: 1, licenseNumber: 1 }, { sparse: true });
MedicalTechnologistSchema.index({ tenantId: 1, status: 1 });
MedicalTechnologistSchema.index({ tenantId: 1, createdAt: -1 });

// Create the login account when a profile is added (hook must be added before model registration)
MedicalTechnologistSchema.post('save', async function (doc: IMedicalTechnologist) {
  await ensureStaffUser({
    doc,
    profileField: 'medicalTechnologistProfile',
    roleNames: ['medical-technologist'],
    label: 'medical technologist',
  });
});

const MedicalTechnologistModel =
  mongoose.models.MedicalTechnologist || mongoose.model<IMedicalTechnologist>('MedicalTechnologist', MedicalTechnologistSchema);

export default MedicalTechnologistModel;
