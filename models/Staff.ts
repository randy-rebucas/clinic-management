import mongoose, { Schema, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

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

// Register Staff model immediately after schema definition
// This ensures it's available when other models (like User) reference it via ref: 'Staff'
if (!mongoose.models.Staff) {
  mongoose.model<IStaff>('Staff', StaffSchema);
}

// Post-save hook to automatically create a User when a Staff is created
StaffSchema.post('save', async function (doc: IStaff) {
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

    // Check if a User with this staffInfo already exists (to avoid duplicates on updates)
    const existingUserByProfile = await User.findOne({ staffInfo: doc._id });
    
    if (existingUserByProfile) {
      // User already linked to this staff, skip
      return;
    }

    // Check if a User with this email already exists
    const existingUserByEmail = await User.findOne({ email: doc.email.toLowerCase().trim() });
    
    if (!existingUserByEmail) {
      // Find the staff role based on staffType
      let staffRole = null;
      
      if (doc.staffType) {
        // Use staffType to determine the role
        staffRole = await Role.findOne({ name: doc.staffType });
      }
      
      // If staffType doesn't match a role, try to find a role based on position
      if (!staffRole && doc.position) {
        const positionLower = doc.position.toLowerCase();
        if (positionLower.includes('nurse')) {
          staffRole = await Role.findOne({ name: 'nurse' });
        } else if (positionLower.includes('receptionist')) {
          staffRole = await Role.findOne({ name: 'receptionist' });
        } else if (positionLower.includes('accountant')) {
          staffRole = await Role.findOne({ name: 'accountant' });
        }
      }
      
      // If still no role found, try 'staff' as a fallback
      if (!staffRole) {
        staffRole = await Role.findOne({ name: 'staff' });
      }
      
      // If still no role found, try 'employee' as a last fallback
      if (!staffRole) {
        staffRole = await Role.findOne({ name: 'employee' });
      }
      
      if (!staffRole) {
        console.warn(`⚠️  Staff role not found. User not created for staff: ${doc.email}`);
        return;
      }

      // Generate a default password (can be changed on first login)
      // Using a combination of employeeId or phone for security
      const defaultPassword = `Staff${doc.employeeId?.slice(-4) || doc.phone.slice(-4)}!`;
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);

      // Create the user
      const user = await User.create({
        name: `${doc.firstName} ${doc.lastName}`.trim(),
        email: doc.email.toLowerCase().trim(),
        password: hashedPassword,
        role: staffRole._id,
        staffInfo: doc._id,
        tenantId: doc.tenantId,
        status: doc.status === 'active' ? 'active' : 'inactive',
      });

      console.log(`✅ Created user account for staff: ${doc.email} (default password: ${defaultPassword})`);
    } else {
      // User exists, but update the staffInfo reference if not set
      if (!existingUserByEmail.staffInfo) {
        existingUserByEmail.staffInfo = doc._id;
        await existingUserByEmail.save();
        console.log(`✅ Linked existing user to staff: ${doc.email}`);
      }
    }
  } catch (error: any) {
    // Log error but don't throw - we don't want to prevent staff creation if user creation fails
    console.error(`⚠️  Error creating user for staff ${doc.email}:`, error.message);
  }
});

// Register Staff model immediately to ensure it's available when other models reference it
// This prevents "Schema hasn't been registered" errors when User or other models
// try to reference Staff via ref: 'Staff'
const StaffModel = mongoose.models.Staff || mongoose.model<IStaff>('Staff', StaffSchema);

export default StaffModel;

