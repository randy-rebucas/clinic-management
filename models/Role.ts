import mongoose, { Schema, Document, Types } from 'mongoose';

export type RoleName = 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant' | 'medical-representative';

export interface IRole extends Document {
  name: RoleName; // Unique role identifier
  displayName: string; // Human-readable name (e.g., "Administrator", "Doctor")
  description?: string; // Role description
  level?: number; // Hierarchy level (higher = more privileges)
  isActive: boolean; // Whether role is currently active
  defaultPermissions?: Array<{
    resource: string;
    actions: string[];
  }>; // Default permissions for this role
  permissions?: Types.ObjectId[]; // Array reference to Permission collection
  
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema: Schema = new Schema(
  {
    name: {
      type: String,
      enum: ['admin', 'doctor', 'nurse', 'receptionist', 'accountant', 'medical-representative'],
      required: [true, 'Role name is required'],
      unique: true,
      index: true,
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    level: {
      type: Number,
      min: 0,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    defaultPermissions: [{
      resource: {
        type: String,
        required: true,
        trim: true,
      },
      actions: [{
        type: String,
      }],
    }],
    permissions: [{
      type: Schema.Types.ObjectId,
      ref: 'Permission',
    }],
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
RoleSchema.index({ name: 1, isActive: 1 });
RoleSchema.index({ level: -1 });

// Prevent re-compilation during development
const Role = mongoose.models.Role || mongoose.model<IRole>('Role', RoleSchema);

export default Role;

