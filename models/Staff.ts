import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IStaff extends Document {
  // Reference to User (one-to-one relationship)
  user: Types.ObjectId;
  
  // Staff information
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
  
  createdAt: Date;
  updatedAt: Date;
}

const StaffSchema: Schema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      unique: true,
      index: true,
    },
    employeeId: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
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
    phone: {
      type: String,
      trim: true,
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
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
StaffSchema.index({ employeeId: 1 });
StaffSchema.index({ department: 1 });
StaffSchema.index({ position: 1 });

// Prevent re-compilation during development
const Staff = mongoose.models.Staff || mongoose.model<IStaff>('Staff', StaffSchema);

export default Staff;

