import mongoose, { Schema, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IMedicalRepresentative extends Document {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  
  // Company and territory information
  company: string;
  territory?: string;
  products?: string[]; // Products they represent
  
  // Contact and availability
  availability?: {
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
  
  // Internal notes (staff-only)
  internalNotes?: Array<{
    note: string;
    createdBy: Types.ObjectId;
    createdAt: Date;
    isImportant?: boolean;
  }>;
  
  // Performance metrics
  performanceMetrics?: {
    totalVisits: number;
    completedVisits: number;
    cancelledVisits: number;
    lastUpdated: Date;
  };
  
  // Additional profile information
  title?: string; // Mr., Ms., etc.
  bio?: string;
  status: 'active' | 'inactive' | 'on-leave';
  
  createdAt: Date;
  updatedAt: Date;
}

const MedicalRepresentativeSchema: Schema = new Schema(
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
    company: {
      type: String,
      required: [true, 'Company is required'],
      trim: true,
    },
    territory: {
      type: String,
      trim: true,
    },
    products: [{
      type: String,
      trim: true,
    }],
    availability: [
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
    internalNotes: [
      {
        note: { type: String, required: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
        isImportant: { type: Boolean, default: false },
      },
    ],
    performanceMetrics: {
      totalVisits: { type: Number, default: 0 },
      completedVisits: { type: Number, default: 0 },
      cancelledVisits: { type: Number, default: 0 },
      lastUpdated: { type: Date, default: Date.now },
    },
    title: { type: String, trim: true },
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

// Indexes for efficient queries
MedicalRepresentativeSchema.index({ email: 1 }); // Additional index (unique already creates one)
MedicalRepresentativeSchema.index({ company: 1, status: 1 }); // For company-based queries
MedicalRepresentativeSchema.index({ status: 1 }); // For status-based queries
MedicalRepresentativeSchema.index({ createdAt: -1 }); // For sorting by creation date

// Register MedicalRepresentative model immediately after schema definition
if (!mongoose.models.MedicalRepresentative) {
  mongoose.model<IMedicalRepresentative>('MedicalRepresentative', MedicalRepresentativeSchema);
}

// Post-save hook to automatically create a User when a MedicalRepresentative is created
MedicalRepresentativeSchema.post('save', async function (doc: IMedicalRepresentative) {
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

    // Check if a User with this medicalRepresentativeProfile already exists (to avoid duplicates on updates)
    const existingUserByProfile = await User.findOne({ medicalRepresentativeProfile: doc._id });
    
    if (existingUserByProfile) {
      // User already linked to this medical representative, skip
      return;
    }

    // Check if a User with this email already exists
    const existingUserByEmail = await User.findOne({ email: doc.email.toLowerCase().trim() });
    
    if (!existingUserByEmail) {
      // Find the medical-representative role
      const medicalRepRole = await Role.findOne({ name: 'medical-representative' });
      
      if (!medicalRepRole) {
        console.warn(`⚠️  Medical-representative role not found. User not created for medical representative: ${doc.email}`);
        return;
      }

      // Generate a default password (can be changed on first login)
      const defaultPassword = `MedRep${doc.company.slice(0, 4).toUpperCase()}${doc.phone.slice(-4)}!`;
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      // Create the user
      const user = await User.create({
        name: `${doc.firstName} ${doc.lastName}`.trim(),
        email: doc.email.toLowerCase().trim(),
        password: hashedPassword,
        role: medicalRepRole._id,
        medicalRepresentativeProfile: doc._id,
        status: doc.status === 'active' ? 'active' : 'inactive',
      });

      console.log(`✅ Created user account for medical representative: ${doc.email} (default password: ${defaultPassword})`);
    } else {
      // User exists, but update the medicalRepresentativeProfile reference if not set
      if (!existingUserByEmail.medicalRepresentativeProfile) {
        existingUserByEmail.medicalRepresentativeProfile = doc._id;
        await existingUserByEmail.save();
        console.log(`✅ Linked existing user to medical representative: ${doc.email}`);
      }
    }
  } catch (error: any) {
    // Log error but don't throw - we don't want to prevent medical representative creation if user creation fails
    console.error(`⚠️  Error creating user for medical representative ${doc.email}:`, error.message);
  }
});

// Register MedicalRepresentative model immediately to ensure it's available when other models reference it
const MedicalRepresentativeModel = mongoose.models.MedicalRepresentative || mongoose.model<IMedicalRepresentative>('MedicalRepresentative', MedicalRepresentativeSchema);

export default MedicalRepresentativeModel;

