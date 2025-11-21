import mongoose, { Document, Schema, Types } from 'mongoose';

export type UserRole = 'admin' | 'doctor' | 'nurse' | 'receptionist' | 'accountant';

export interface IPermission {
  resource: string; // e.g., 'patients', 'appointments', 'billing'
  actions: string[]; // e.g., ['read', 'write', 'delete']
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  // Staff information
  staffInfo?: {
    employeeId?: string;
    department?: string;
    position?: string;
    hireDate?: Date;
    phone?: string;
    address?: string;
    emergencyContact?: {
      name: string;
      phone: string;
      relationship: string;
    };
  };
  // Permissions (optional, for fine-grained control)
  permissions?: IPermission[];
  // Link to Doctor profile if role is doctor
  doctorProfile?: Types.ObjectId;
  status: 'active' | 'inactive' | 'suspended';
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters long'],
    },
    role: {
      type: String,
      enum: ['admin', 'doctor', 'nurse', 'receptionist', 'accountant'],
      required: true,
      index: true,
    },
    staffInfo: {
      employeeId: { type: String, trim: true, index: true },
      department: { type: String, trim: true },
      position: { type: String, trim: true },
      hireDate: { type: Date },
      phone: { type: String, trim: true },
      address: { type: String, trim: true },
      emergencyContact: {
        name: { type: String, trim: true },
        phone: { type: String, trim: true },
        relationship: { type: String, trim: true },
      },
    },
    permissions: [{
      resource: { type: String, required: true },
      actions: [{ type: String }],
    }],
    doctorProfile: { type: Schema.Types.ObjectId, ref: 'Doctor' },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
      index: true,
    },
    lastLogin: { type: Date },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
UserSchema.index({ doctorProfile: 1 });

// Prevent re-compilation during development
const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;

