import mongoose, { Schema, Document, Types } from 'mongoose';
import { ensureStaffUser } from './staff-user-link';

export interface IDoctor extends Document {
  tenantId?: Types.ObjectId; // Reference to Tenant (optional for backward compatibility)
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specializationId: Types.ObjectId; // Reference to Specialization model
  licenseNumber: string;
  ptr?: string;
  philhealthPan?: string;
  ptrNumber?: string;
  /** PDEA S2 licence, required on prescriptions for dangerous drugs. */
  s2Number?: string;
  /**
   * The doctor's own signature, applied to documents they issue. Only the doctor may set it
   * (see /api/account/signature); the image is excluded from queries unless selected.
   */
  signature?: {
    image?: string;
    updatedAt?: Date;
  };

  // Schedule and availability
  schedule: {
    dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
    startTime: string; // HH:mm format
    endTime: string; // HH:mm format
    isAvailable: boolean; // Can temporarily disable specific days
  }[];
  
  // Availability overrides (for specific dates)
  availabilityOverrides?: {
    date: Date;
    isAvailable: boolean;
    startTime?: string;
    endTime?: string;
    reason?: string;
  }[];
  
  // Internal notes (staff-only)
  internalNotes?: Array<{
    note: string;
    createdBy: Types.ObjectId;
    createdAt: Date;
    isImportant?: boolean;
  }>;
  
  // Performance metrics
  performanceMetrics?: {
    totalAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    noShowAppointments: number;
    averageRating?: number;
    lastUpdated: Date;
  };
  
  // Additional profile information
  title?: string; // Dr., Prof., etc.
  qualifications?: string[];
  bio?: string;
  department?: string;
  status: 'active' | 'inactive' | 'on-leave';
  
  createdAt: Date;
  updatedAt: Date;
}

const DoctorSchema: Schema = new Schema(
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
    specializationId: {
      type: Schema.Types.ObjectId,
      ref: 'Specialization',
      required: [true, 'Specialization is required'],
      index: true,
    },
    licenseNumber: {
      type: String,
      required: [true, 'License number is required'],
      trim: true,
    },
    ptr: {
      type: String,
      trim: true,
      default: '',
    },
    ptrNumber: {
      type: String,
      trim: true,
    },
    philhealthPan: {
      type: String,
      trim: true,
    },
    s2Number: {
      type: String,
      trim: true,
    },
    signature: {
      image: { type: String, select: false },
      updatedAt: { type: Date },
    },
    schedule: [
      {
        dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        isAvailable: { type: Boolean, default: true },
      },
    ],
    
    // Availability overrides
    availabilityOverrides: [
      {
        date: { type: Date, required: true },
        isAvailable: { type: Boolean, required: true },
        startTime: { type: String },
        endTime: { type: String },
        reason: { type: String },
      },
    ],
    
    // Internal notes
    internalNotes: [
      {
        note: { type: String, required: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
        isImportant: { type: Boolean, default: false },
      },
    ],
    
    // Performance metrics
    performanceMetrics: {
      totalAppointments: { type: Number, default: 0 },
      completedAppointments: { type: Number, default: 0 },
      cancelledAppointments: { type: Number, default: 0 },
      noShowAppointments: { type: Number, default: 0 },
      averageRating: { type: Number, min: 0, max: 5 },
      lastUpdated: { type: Date, default: Date.now },
    },
    
    // Additional profile information
    title: { type: String, trim: true },
    qualifications: [{ type: String, trim: true }],
    bio: { type: String },
    department: { type: String, trim: true },
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

// Indexes for efficient queries
DoctorSchema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true }); // Tenant-scoped unique email
DoctorSchema.index({ tenantId: 1, licenseNumber: 1 }, { unique: true, sparse: true }); // Tenant-scoped unique license
DoctorSchema.index({ tenantId: 1, ptr: 1 }, { sparse: true }); // Tenant-scoped PTR queries
DoctorSchema.index({ tenantId: 1, specializationId: 1, status: 1 }); // Tenant-scoped specialization reference queries
DoctorSchema.index({ tenantId: 1, department: 1, status: 1 }); // Tenant-scoped department queries
DoctorSchema.index({ tenantId: 1, status: 1 }); // Tenant-scoped status queries

// Post-save hook to automatically create a User when a Doctor is created
// IMPORTANT: Hook must be added BEFORE model registration
DoctorSchema.post('save', async function (doc: IDoctor) {
  await ensureStaffUser({
    doc,
    profileField: 'doctorProfile',
    roleNames: ['doctor'],
    label: 'doctor',
  });
});

// Register Doctor model immediately to ensure it's available when other models reference it
// This prevents "Schema hasn't been registered" errors when User or other models
// try to reference Doctor via ref: 'Doctor'
const DoctorModel = mongoose.models.Doctor || mongoose.model<IDoctor>('Doctor', DoctorSchema);

export default DoctorModel;

