import mongoose, { Schema, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IReceptionist extends Document {
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;
  
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
    employeeId: {
      type: String,
      trim: true,
      // sparse index is created explicitly below via compound index
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

// Indexes for efficient queries (tenant-scoped)
ReceptionistSchema.index({ tenantId: 1, email: 1 }, { unique: true, sparse: true }); // Tenant-scoped unique email
ReceptionistSchema.index({ tenantId: 1, employeeId: 1 }, { sparse: true });
ReceptionistSchema.index({ tenantId: 1, department: 1, status: 1 }); // For department-based queries
ReceptionistSchema.index({ tenantId: 1, status: 1 }); // For status-based queries
ReceptionistSchema.index({ tenantId: 1, createdAt: -1 }); // For sorting by creation date

// Post-save hook to automatically create a User when a Receptionist is created
// IMPORTANT: Hook must be added BEFORE model registration
ReceptionistSchema.post('save', async function (doc: IReceptionist) {
  try {
    console.log('\n🔵 [RECEPTIONIST POST-SAVE HOOK] Starting...');
    console.log('📋 Receptionist Details:', {
      id: doc._id,
      email: doc.email,
      name: `${doc.firstName} ${doc.lastName}`,
      tenantId: doc.tenantId?.toString() || 'none',
      status: doc.status,
      employeeId: doc.employeeId || 'none'
    });
    
    // Ensure models are registered by importing them first
    if (!mongoose.models.User) {
      console.log('⚙️  Importing User model...');
      await import('./User');
    }
    if (!mongoose.models.Role) {
      console.log('⚙️  Importing Role model...');
      await import('./Role');
    }
    
    // Now get the models from mongoose.models (they should be registered now)
    const User = mongoose.models.User;
    const Role = mongoose.models.Role;
    
    if (!User || !Role) {
      console.warn(`⚠️  Required models not registered. User: ${!!User}, Role: ${!!Role}`);
      return;
    }
    console.log('✅ Models registered successfully');

    // Check if a User with this receptionistProfile already exists (to avoid duplicates on updates)
    console.log('🔍 Checking if user with receptionistProfile already exists...');
    const existingUserByProfile = await User.findOne({ receptionistProfile: doc._id });
    
    if (existingUserByProfile) {
      console.log('⏭️  User already linked to this receptionist profile. Skipping creation.');
      return;
    }
    console.log('✅ No existing user with this profile found');

    // Check if a User with this email already exists
    console.log(`🔍 Checking if user with email ${doc.email} already exists...`);
    const existingUserByEmail = await User.findOne({ email: doc.email.toLowerCase().trim() });
    
    if (!existingUserByEmail) {
      console.log('✅ No existing user with this email found. Proceeding to create new user...');
      
      // Find the receptionist role (tenant-scoped if tenantId exists)
      let receptionistRole;
      console.log('🔍 Looking for receptionist role...');
      
      if (doc.tenantId) {
        console.log(`🏢 Tenant-scoped search for tenant: ${doc.tenantId}`);
        
        // First try to find tenant-scoped receptionist role
        receptionistRole = await Role.findOne({ 
          name: 'receptionist',
          tenantId: doc.tenantId 
        });
        
        if (receptionistRole) {
          console.log('✅ Found tenant-scoped receptionist role:', {
            roleId: receptionistRole._id,
            roleName: receptionistRole.name,
            tenantId: receptionistRole.tenantId?.toString()
          });
        } else {
          console.log('⚠️  No tenant-scoped role found, trying global role...');
          
          // If no tenant-scoped role, try global receptionist role
          receptionistRole = await Role.findOne({ 
            name: 'receptionist',
            $or: [
              { tenantId: { $exists: false } },
              { tenantId: null }
            ]
          });
          
          if (receptionistRole) {
            console.log('✅ Found global receptionist role:', {
              roleId: receptionistRole._id,
              roleName: receptionistRole.name
            });
          }
        }
      } else {
        console.log('🌍 No tenant context, searching for global role...');
        
        // No tenant, look for global receptionist role
        receptionistRole = await Role.findOne({ 
          name: 'receptionist',
          $or: [
            { tenantId: { $exists: false } },
            { tenantId: null }
          ]
        });
        
        if (receptionistRole) {
          console.log('✅ Found global receptionist role:', {
            roleId: receptionistRole._id,
            roleName: receptionistRole.name
          });
        }
      }
      
      if (!receptionistRole) {
        console.warn(`❌ Receptionist role not found. User not created for receptionist: ${doc.email}`);
        console.warn('💡 Make sure receptionist role exists in the database');
        return;
      }

      // Generate a default password (can be changed on first login)
      const defaultPassword = `Password1234!`;
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      console.log('🔐 Generated default password');

      // Create the user with tenantId if receptionist has one
      const userData: any = {
        name: `${doc.firstName} ${doc.lastName}`.trim(),
        email: doc.email.toLowerCase().trim(),
        password: hashedPassword,
        role: receptionistRole._id,
        receptionistProfile: doc._id,
        status: doc.status === 'active' ? 'active' : 'inactive',
      };
      
      // Add tenantId if receptionist has one
      if (doc.tenantId) {
        userData.tenantId = doc.tenantId;
      }

      console.log('👤 Creating user with data:', {
        name: userData.name,
        email: userData.email,
        role: userData.role.toString(),
        receptionistProfile: userData.receptionistProfile.toString(),
        tenantId: userData.tenantId?.toString() || 'none',
        status: userData.status
      });

      const user = await User.create(userData);

      console.log('✅ SUCCESS! Created user account for receptionist');
      console.log('📧 Email:', doc.email);
      console.log('🔑 Default Password:', defaultPassword);
      console.log('🆔 User ID:', user._id.toString());
      console.log('💡 User should change password on first login\n');
    } else {
      console.log('ℹ️  User with this email already exists:', existingUserByEmail.email);
      
      // User exists, but update the receptionistProfile reference if not set
      if (!existingUserByEmail.receptionistProfile) {
        console.log('🔗 Linking existing user to receptionist profile...');
        existingUserByEmail.receptionistProfile = doc._id;
        await existingUserByEmail.save();
        console.log(`✅ Linked existing user to receptionist: ${doc.email}\n`);
      } else {
        console.log('ℹ️  User already has receptionistProfile linked. No action needed.\n');
      }
    }
  } catch (error: any) {
    // Log error but don't throw - we don't want to prevent receptionist creation if user creation fails
    console.error('\n❌ [ERROR] Failed to create/link user for receptionist');
    console.error('📧 Receptionist email:', doc.email);
    console.error('🔴 Error message:', error.message);
    console.error('🔍 Error stack:', error.stack);
    console.error('\n');
  }
});

// Register Receptionist model immediately to ensure it's available when other models reference it
const ReceptionistModel = mongoose.models.Receptionist || mongoose.model<IReceptionist>('Receptionist', ReceptionistSchema);

export default ReceptionistModel;

