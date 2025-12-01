import mongoose, { Schema, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IAdmin extends Document {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  
  // Admin-specific information
  title?: string; // Mr., Ms., Dr., etc.
  department?: string;
  accessLevel?: 'full' | 'limited'; // Full access or limited admin access
  
  // Internal notes
  internalNotes?: Array<{
    note: string;
    createdBy: Types.ObjectId;
    createdAt: Date;
    isImportant?: boolean;
  }>;
  
  // Additional profile information
  bio?: string;
  status: 'active' | 'inactive' | 'suspended';
  
  createdAt: Date;
  updatedAt: Date;
}

const AdminSchema: Schema = new Schema(
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
      trim: true,
    },
    title: {
      type: String,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    accessLevel: {
      type: String,
      enum: ['full', 'limited'],
      default: 'full',
    },
    internalNotes: [
      {
        note: { type: String, required: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
        isImportant: { type: Boolean, default: false },
      },
    ],
    bio: {
      type: String,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
AdminSchema.index({ email: 1 });
AdminSchema.index({ status: 1 });
AdminSchema.index({ department: 1 });

// Register Admin model immediately after schema definition
if (!mongoose.models.Admin) {
  mongoose.model<IAdmin>('Admin', AdminSchema);
}

// Post-save hook to automatically create a User when an Admin is created
AdminSchema.post('save', async function (doc: IAdmin) {
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

    // Check if a User with this adminProfile already exists (to avoid duplicates on updates)
    const existingUserByProfile = await User.findOne({ adminProfile: doc._id });
    
    if (existingUserByProfile) {
      // User already linked to this admin, skip
      return;
    }

    // Check if a User with this email already exists
    const existingUserByEmail = await User.findOne({ email: doc.email.toLowerCase().trim() });
    
    if (!existingUserByEmail) {
      // Find the admin role
      const adminRole = await Role.findOne({ name: 'admin' });
      
      if (!adminRole) {
        console.warn(`⚠️  Admin role not found. User not created for admin: ${doc.email}`);
        return;
      }

      // Generate a default password (can be changed on first login)
      const defaultPassword = `Admin${doc.firstName.slice(0, 2).toUpperCase()}${doc.phone?.slice(-4) || '1234'}!`;
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      // Create the user
      const user = await User.create({
        name: `${doc.firstName} ${doc.lastName}`.trim(),
        email: doc.email.toLowerCase().trim(),
        password: hashedPassword,
        role: adminRole._id,
        adminProfile: doc._id,
        status: doc.status === 'active' ? 'active' : 'inactive',
      });

      console.log(`✅ Created user account for admin: ${doc.email} (default password: ${defaultPassword})`);
    } else {
      // User exists, but update the adminProfile reference if not set
      if (!existingUserByEmail.adminProfile) {
        existingUserByEmail.adminProfile = doc._id;
        await existingUserByEmail.save();
        console.log(`✅ Linked existing user to admin: ${doc.email}`);
      }
    }
  } catch (error: any) {
    // Log error but don't throw - we don't want to prevent admin creation if user creation fails
    console.error(`⚠️  Error creating user for admin ${doc.email}:`, error.message);
  }
});

// Register Admin model immediately to ensure it's available when other models reference it
const AdminModel = mongoose.models.Admin || mongoose.model<IAdmin>('Admin', AdminSchema);

export default AdminModel;

