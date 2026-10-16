import mongoose, { Schema, Document, Types } from 'mongoose';
import { ensureStaffUser } from './staff-user-link';

export interface IReceptionist extends Document {
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;
  
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  
  // Receptionist-specific information
  employeeId?: string;
  department?: string;
  hireDate?: Date;
  address?: string;
  
  // Schedule and availability
  schedule?: {
    dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
    startTime: string; // HH:mm format
    endTime: string; // HH:mm format
    isAvailable: boolean;
  }[];
  
  // Availability overrides (for specific dates)
  availabilityOverrides?: {
    date: Date;
    isAvailable: boolean;
    startTime?: string;
    endTime?: string;
    reason?: string;
  }[];
  
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
  
  // Performance metrics
  performanceMetrics?: {
    totalAppointments: number;
    scheduledAppointments: number;
    cancelledAppointments: number;
    lastUpdated: Date;
  };
  
  // Additional profile information
  title?: string;
  bio?: string;
  status: 'active' | 'inactive' | 'on-leave';
  
  createdAt: Date;
  updatedAt: Date;
}

const ReceptionistSchema: Schema = new Schema(
  {
    // Tenant reference for multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
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
    employeeId: {
      type: String,
      trim: true,
      // sparse index is created explicitly below via compound index
    },
    department: {
      type: String,
      trim: true,
    },
    hireDate: {
      type: Date,
    },
    address: {
      type: String,
      trim: true,
    },
    schedule: [
      {
        dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        isAvailable: { type: Boolean, default: true },
      },
    ],
    availabilityOverrides: [
      {
        date: { type: Date, required: true },
        isAvailable: { type: Boolean, required: true },
        startTime: { type: String },
        endTime: { type: String },
        reason: { type: String },
      },
    ],
    emergencyContact: {
      name: {
        type: String,
        trim: true,
      },
      phone: {
        type: String,
        trim: true,
      },
      relationship: {
        type: String,
        trim: true,
      },
    },
    internalNotes: [
      {
        note: { type: String, required: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
        isImportant: { type: Boolean, default: false },
      },
    ],
    performanceMetrics: {
      totalAppointments: { type: Number, default: 0 },
      scheduledAppointments: { type: Number, default: 0 },
      cancelledAppointments: { type: Number, default: 0 },
      lastUpdated: { type: Date, default: Date.now },
    },
    title: {
      type: String,
      trim: true,
    },
    bio: {
      type: String,
    },
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
ReceptionistSchema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true }); // Tenant-scoped unique email
ReceptionistSchema.index({ tenantId: 1, employeeId: 1 }, { sparse: true });
ReceptionistSchema.index({ tenantId: 1, department: 1, status: 1 }); // For department-based queries
ReceptionistSchema.index({ tenantId: 1, status: 1 }); // For status-based queries
ReceptionistSchema.index({ tenantId: 1, createdAt: -1 }); // For sorting by creation date

// Post-save hook to automatically create a User when a Receptionist is created
// IMPORTANT: Hook must be added BEFORE model registration
ReceptionistSchema.post('save', async function (doc: IReceptionist) {
  await ensureStaffUser({
    doc,
    profileField: 'receptionistProfile',
    roleNames: ['receptionist'],
    label: 'receptionist',
  });
});

// Register Receptionist model immediately to ensure it's available when other models reference it
const ReceptionistModel = mongoose.models.Receptionist || mongoose.model<IReceptionist>('Receptionist', ReceptionistSchema);

export default ReceptionistModel;

