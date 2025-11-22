import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: Types.ObjectId; // Reference to Role
  // Staff information reference (one-to-one relationship)
  staffInfo?: Types.ObjectId;
  // Permissions reference (one-to-many relationship)
  permissions?: Types.ObjectId[];
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
      type: Schema.Types.ObjectId,
      ref: 'Role',
      required: [true, 'Role is required'],
      index: true,
    },
    staffInfo: {
      type: Schema.Types.ObjectId,
      ref: 'Staff',
      index: true,
    },
    permissions: [{
      type: Schema.Types.ObjectId,
      ref: 'Permission',
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

