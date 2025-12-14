import mongoose, { Schema, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IDoctor extends Document {
  tenantId?: Types.ObjectId; // Reference to Tenant (optional for backward compatibility)
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialization: string;
  licenseNumber: string;
  
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
    specialization: {
      type: String,
      required: [true, 'Specialization is required'],
      trim: true,
    },
    licenseNumber: {
      type: String,
      required: [true, 'License number is required'],
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
DoctorSchema.index({ tenantId: 1, specialization: 1, status: 1 }); // Tenant-scoped specialization queries
DoctorSchema.index({ tenantId: 1, department: 1, status: 1 }); // Tenant-scoped department queries
DoctorSchema.index({ tenantId: 1, status: 1 }); // Tenant-scoped status queries

// Register Doctor model immediately after schema definition
// This ensures it's available when other models (like User) reference it via ref: 'Doctor'
// Must be registered before the post-save hook that imports User model
if (!mongoose.models.Doctor) {
  mongoose.model<IDoctor>('Doctor', DoctorSchema);
}

// Post-save hook to automatically create a User when a Doctor is created
DoctorSchema.post('save', async function (doc: IDoctor) {
  try {
    // Ensure models are registered by importing them first
    // Import the model files to ensure they're registered in mongoose.models
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

    // Check if a User with this doctorProfile already exists (to avoid duplicates on updates)
    const existingUserByProfile = await User.findOne({ doctorProfile: doc._id });
    
    if (existingUserByProfile) {
      // User already linked to this doctor, skip
      return;
    }

    // Check if a User with this email already exists
    const existingUserByEmail = await User.findOne({ email: doc.email.toLowerCase().trim() });
    
    if (!existingUserByEmail) {
      // Find the doctor role
      const doctorRole = await Role.findOne({ name: 'doctor' });
      
      if (!doctorRole) {
        console.warn(`⚠️  Doctor role not found. User not created for doctor: ${doc.email}`);
        return;
      }

      // Generate a default password (can be changed on first login)
      // Using a combination of license number for security
      const defaultPassword = `Doctor${doc.licenseNumber.slice(-4)}!`;
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      // Create the user
      const user = await User.create({
        name: `${doc.firstName} ${doc.lastName}`.trim(),
        email: doc.email.toLowerCase().trim(),
        password: hashedPassword,
        role: doctorRole._id,
        doctorProfile: doc._id,
        status: doc.status === 'active' ? 'active' : 'inactive',
      });

      console.log(`✅ Created user account for doctor: ${doc.email} (default password: ${defaultPassword})`);
    } else {
      // User exists, but update the doctorProfile reference if not set
      if (!existingUserByEmail.doctorProfile) {
        existingUserByEmail.doctorProfile = doc._id;
        await existingUserByEmail.save();
        console.log(`✅ Linked existing user to doctor: ${doc.email}`);
      }
    }
  } catch (error: any) {
    // Log error but don't throw - we don't want to prevent doctor creation if user creation fails
    console.error(`⚠️  Error creating user for doctor ${doc.email}:`, error.message);
  }
});

// Register Doctor model immediately to ensure it's available when other models reference it
// This prevents "Schema hasn't been registered" errors when User or other models
// try to reference Doctor via ref: 'Doctor'
const DoctorModel = mongoose.models.Doctor || mongoose.model<IDoctor>('Doctor', DoctorSchema);

export default DoctorModel;

