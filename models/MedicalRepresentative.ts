import mongoose, { Schema, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IMedicalRepresentative extends Document {
  // Tenant references for multi-tenant support
  tenantIds: {
    type: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Tenant',
        index: true,
      },
    ],
    required: false,
    default: undefined,
  },
  // User account reference (reverse reference from User.medicalRepresentativeProfile)
  userId?: Types.ObjectId;

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

  // Activation and payment tracking
  isActivated: { type: boolean, default: false }; // Whether the medical rep has completed payment and activation
  activationDate?: { type: Date, default: undefined }; // Date when they became activated
  paymentStatus: { type: string, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' };
  paymentDate?: Date; // When payment was processed
  paymentAmount?: number; // Registration/activation fee
  paymentMethod?: string; // Payment method used (credit card, bank transfer, etc.)
  paymentReference?: string; // Payment transaction reference or receipt number

  createdAt: Date;
  updatedAt: Date;
}

const MedicalRepresentativeSchema: Schema = new Schema(
  {
    // Tenant references for multi-tenant support
    tenantIds: [{
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    }],

    // User account reference (reverse reference from User.medicalRepresentativeProfile)
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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
      default: 'inactive',
    },
    // Activation and payment tracking
    isActivated: {
      type: Boolean,
      default: false,
      index: true,
    },
    activationDate: {
      type: Date,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },
    paymentDate: {
      type: Date,
    },
    paymentAmount: {
      type: Number,
      min: 0,
    },
    paymentMethod: {
      type: String,
      trim: true,
    },
    paymentReference: {
      type: String,
      trim: true,
    },
    lastLogin: { type: Date },
  },
  {
    timestamps: true,
    strictPopulate: false, // Allow populating fields that may not be in the schema (for backward compatibility during schema updates)
  }
);

// Indexes for efficient queries (tenant-scoped)
MedicalRepresentativeSchema.index({ tenantIds: 1, email: 1 }, { unique: true, sparse: true }); // Tenant-scoped unique email
MedicalRepresentativeSchema.index({ tenantIds: 1, company: 1, status: 1 }); // For company-based queries
MedicalRepresentativeSchema.index({ tenantIds: 1, status: 1 }); // For status-based queries
MedicalRepresentativeSchema.index({ tenantIds: 1, createdAt: -1 }); // For sorting by creation date
MedicalRepresentativeSchema.index({ userId: 1 }); // For user lookup

// Pre-save hook to track if this is a new document
MedicalRepresentativeSchema.pre('save', function (next) {
  // Store whether this is a new document before save
  (this as any).$locals = (this as any).$locals || {};
  (this as any).$locals.wasNew = this.isNew;
  next();
});

// Post-save hook to automatically create a User account for new medical representatives
MedicalRepresentativeSchema.post('save', async function (doc) {
  try {
    // Only run for new documents
    if (!(this as any).$locals?.wasNew) {
      return;
    }

    // Dynamically import to avoid circular dependencies
    const User = (await import('./User')).default;
    const Role = (await import('./Role')).default;

    // Check if User already exists
    const existingUser = await User.findOne({ email: doc.email });
    if (existingUser) {
      console.log('User already exists for medical representative:', doc.email);
      // Link the existing user to this medical representative
      await doc.updateOne({ userId: existingUser._id });
      return;
    }

    // Find or create the medical-representative role (tenant-agnostic)
    let role = await Role.findOne({ name: 'medical-representative' });
    if (!role) {
      console.log('Creating medical-representative role');
      role = await Role.create({
        name: 'medical-representative',
        description: 'Medical Representative with access to their portal',
        permissions: ['view_own_profile', 'update_own_profile'],
        tenantId: undefined, // Tenant-agnostic role
      });
    }

    // Generate a default password (can be changed on first login)
    const defaultPassword = `Password1234!`;
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    console.log('🔐 Generated default password');

    // Create a User account for this medical representative
    const newUser = await User.create({
      name: `${doc.firstName} ${doc.lastName}`.trim(),
      email: doc.email,
      password: hashedPassword, // Use the generated hashed password
      role: role._id,
      isActive: true,
      medicalRepresentativeProfile: doc._id,
      tenantId: undefined, // Medical representatives are not tied to a specific tenant
    });

    console.log('Created User account for medical representative:', newUser.email);

    // Link the User to this MedicalRepresentative using updateOne to avoid triggering save again
    await doc.updateOne({ userId: newUser._id });
  } catch (error) {
    console.error('Error creating User for MedicalRepresentative:', error);
    // Don't throw - allow the medical representative to be created even if user creation fails
  }
});

export default mongoose.models.MedicalRepresentative || mongoose.model<IMedicalRepresentative>('MedicalRepresentative', MedicalRepresentativeSchema);


