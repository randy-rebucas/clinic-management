import mongoose, { Schema, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IReceptionist extends Document {
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
      unique: true,
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
      sparse: true,
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

// Indexes for efficient queries
ReceptionistSchema.index({ email: 1 }); // Additional index (unique already creates one)
ReceptionistSchema.index({ employeeId: 1 }, { sparse: true });
ReceptionistSchema.index({ department: 1, status: 1 }); // For department-based queries
ReceptionistSchema.index({ status: 1 }); // For status-based queries
ReceptionistSchema.index({ createdAt: -1 }); // For sorting by creation date

// Register Receptionist model immediately after schema definition
if (!mongoose.models.Receptionist) {
  mongoose.model<IReceptionist>('Receptionist', ReceptionistSchema);
}

// Post-save hook to automatically create a User when a Receptionist is created
ReceptionistSchema.post('save', async function (doc: IReceptionist) {
  try {
    // Ensure models are registered by importing them first
    if (!mongoose.models.User) {
      await import('./User');
    }
    if (!mongoose.models.Role) {
      await import('./Role');
    }
    
    // Now get the models from mongoose.models (they should be registered now)
    const User = mongoose.models.User;
    const Role = mongoose.models.Role;
    
    if (!User || !Role) {
      console.warn(`⚠️  Required models not registered. User: ${!!User}, Role: ${!!Role}`);
      return;
    }

    // Check if a User with this receptionistProfile already exists (to avoid duplicates on updates)
    const existingUserByProfile = await User.findOne({ receptionistProfile: doc._id });
    
    if (existingUserByProfile) {
      // User already linked to this receptionist, skip
      return;
    }

    // Check if a User with this email already exists
    const existingUserByEmail = await User.findOne({ email: doc.email.toLowerCase().trim() });
    
    if (!existingUserByEmail) {
      // Find the receptionist role
      const receptionistRole = await Role.findOne({ name: 'receptionist' });
      
      if (!receptionistRole) {
        console.warn(`⚠️  Receptionist role not found. User not created for receptionist: ${doc.email}`);
        return;
      }

      // Generate a default password (can be changed on first login)
      const defaultPassword = `Recep${doc.employeeId?.slice(-4) || doc.phone.slice(-4)}!`;
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      // Create the user
      const user = await User.create({
        name: `${doc.firstName} ${doc.lastName}`.trim(),
        email: doc.email.toLowerCase().trim(),
        password: hashedPassword,
        role: receptionistRole._id,
        receptionistProfile: doc._id,
        status: doc.status === 'active' ? 'active' : 'inactive',
      });

      console.log(`✅ Created user account for receptionist: ${doc.email} (default password: ${defaultPassword})`);
    } else {
      // User exists, but update the receptionistProfile reference if not set
      if (!existingUserByEmail.receptionistProfile) {
        existingUserByEmail.receptionistProfile = doc._id;
        await existingUserByEmail.save();
        console.log(`✅ Linked existing user to receptionist: ${doc.email}`);
      }
    }
  } catch (error: any) {
    // Log error but don't throw - we don't want to prevent receptionist creation if user creation fails
    console.error(`⚠️  Error creating user for receptionist ${doc.email}:`, error.message);
  }
});

// Register Receptionist model immediately to ensure it's available when other models reference it
const ReceptionistModel = mongoose.models.Receptionist || mongoose.model<IReceptionist>('Receptionist', ReceptionistSchema);

export default ReceptionistModel;

