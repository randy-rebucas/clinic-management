import mongoose, { Schema, Document, Types } from 'mongoose';
import { ensureStaffUser } from './staff-user-link';

export interface IStaff extends Document {
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;

  // Basic information
  firstName: string;
  lastName: string;
  email: string;
  phone: string;

  // Staff information
  staffType?: 'nurse' | 'receptionist' | 'accountant' | 'employee' | 'staff';
  employeeId?: string;
  department?: string;
  position?: string;
  hireDate?: Date;
  address?: string;
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };

  status: 'active' | 'inactive' | 'on-leave';

  createdAt: Date;
  updatedAt: Date;
}

const StaffSchema: Schema = new Schema(
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
    staffType: {
      type: String,
      enum: ['nurse', 'receptionist', 'accountant', 'employee', 'staff'],
      trim: true,
    },
    employeeId: {
      type: String,
      trim: true,
      // sparse index is created explicitly below via StaffSchema.index()
    },
    department: {
      type: String,
      trim: true,
    },
    position: {
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
StaffSchema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true }); // Tenant-scoped unique email
StaffSchema.index({ tenantId: 1, employeeId: 1 }, { sparse: true });
StaffSchema.index({ tenantId: 1, department: 1 });
StaffSchema.index({ tenantId: 1, position: 1 });
StaffSchema.index({ tenantId: 1, status: 1 }); // For status-based queries

// Post-save hook to automatically create a User when a Staff is created
// IMPORTANT: Hook must be added BEFORE model registration
StaffSchema.post('save', async function (doc: IStaff) {
  let roleName: string | null = doc.staffType || null;
  if (!roleName && doc.position) {
    const position = doc.position.toLowerCase();
    if (position.includes('nurse')) roleName = 'nurse';
    else if (position.includes('receptionist')) roleName = 'receptionist';
    else if (position.includes('accountant')) roleName = 'accountant';
  }
  await ensureStaffUser({
    doc,
    profileField: 'staffInfo',
    roleNames: roleName ? [roleName] : ['staff', 'employee'],
    label: 'staff',
  });
});

// Register Staff model immediately to ensure it's available when other models reference it
// This prevents "Schema hasn't been registered" errors when User or other models
// try to reference Staff via ref: 'Staff'
const StaffModel = mongoose.models.Staff || mongoose.model<IStaff>('Staff', StaffSchema);

export default StaffModel;

