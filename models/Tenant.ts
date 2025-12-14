import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ITenant extends Document {
  _id: Types.ObjectId;
  name: string;
  subdomain: string; // Unique subdomain identifier
  displayName?: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  settings?: {
    timezone?: string;
    currency?: string;
    dateFormat?: string;
    logo?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };
  status: 'active' | 'inactive' | 'suspended';
  subscription?: {
    plan?: string;
    status?: 'active' | 'cancelled' | 'expired';
    expiresAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const TenantSchema = new Schema<ITenant>(
  {
    _id: {
      type: Schema.Types.ObjectId,
      default: () => new Types.ObjectId(),
    },
    name: {
      type: String,
      required: [true, 'Tenant name is required'],
      trim: true,
      minlength: [2, 'Tenant name must be at least 2 characters long'],
    },
    subdomain: {
      type: String,
      required: [true, 'Subdomain is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Subdomain must contain only lowercase letters, numbers, and hyphens'],
      minlength: [2, 'Subdomain must be at least 2 characters long'],
      maxlength: [63, 'Subdomain must be at most 63 characters long'],
    },
    displayName: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    phone: {
      type: String,
      trim: true,
    },
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      zipCode: { type: String, trim: true },
      country: { type: String, trim: true },
    },
    settings: {
      timezone: { type: String, default: 'UTC' },
      currency: { type: String, default: 'PHP' },
      dateFormat: { type: String, default: 'MM/DD/YYYY' },
      logo: { type: String },
      primaryColor: { type: String },
      secondaryColor: { type: String },
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
    },
    subscription: {
      plan: { type: String },
      status: {
        type: String,
        enum: ['active', 'cancelled', 'expired'],
        default: 'active',
      },
      expiresAt: { type: Date },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
// Note: subdomain index is automatically created by unique: true
TenantSchema.index({ status: 1 });
TenantSchema.index({ 'subscription.status': 1 });
TenantSchema.index({ createdAt: -1 });

// Validation: Ensure subdomain doesn't conflict with reserved words
TenantSchema.pre('save', async function (next) {
  if (this.isModified('subdomain')) {
    const reservedWords = [
      'www',
      'api',
      'admin',
      'app',
      'mail',
      'ftp',
      'localhost',
      'staging',
      'dev',
      'test',
      'demo',
    ];
    
    if (reservedWords.includes(this.subdomain.toLowerCase())) {
      return next(new Error(`Subdomain "${this.subdomain}" is reserved and cannot be used`));
    }
  }
  next();
});

// Post-save hook to automatically create an Admin when a Tenant is created
TenantSchema.post('save', async function (doc: ITenant) {
  try {
    // Only create admin on new tenant creation, not on updates
    if (!this.isNew) {
      return;
    }

    // Ensure models are registered by importing them first
    if (!mongoose.models.Admin) {
      await import('./Admin');
    }
    if (!mongoose.models.Role) {
      await import('./Role');
    }
    
    // Now get the models from mongoose.models (they should be registered now)
    const Admin = mongoose.models.Admin;
    const Role = mongoose.models.Role;
    
    if (!Admin || !Role) {
      console.warn(`⚠️  Required models not registered. Admin: ${!!Admin}, Role: ${!!Role}`);
      return;
    }

    // Check if an Admin already exists for this tenant
    const existingAdmin = await Admin.findOne({ tenantId: doc._id });
    
    if (existingAdmin) {
      // Admin already exists for this tenant, skip
      console.log(`ℹ️  Admin already exists for tenant: ${doc.name}`);
      return;
    }

    // Find or create the admin role for this tenant
    let adminRole = await Role.findOne({ 
      name: 'admin',
      tenantId: doc._id 
    });
    
    // If no tenant-scoped admin role exists, try to find a global one or create one
    if (!adminRole) {
      adminRole = await Role.findOne({ 
        name: 'admin',
        $or: [
          { tenantId: { $exists: false } },
          { tenantId: null }
        ]
      });
      
      // If still no role found, create a tenant-scoped admin role
      if (!adminRole) {
        adminRole = await Role.create({
          tenantId: doc._id,
          name: 'admin',
          displayName: 'Administrator',
          description: 'Full system administrator with all permissions',
          level: 100,
          isActive: true,
        });
        console.log(`✅ Created admin role for tenant: ${doc.name}`);
      }
    }

    // Prepare admin data from tenant information
    // Split tenant name into firstName and lastName
    const nameParts = doc.name.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Admin';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    // Use tenant email or generate one from subdomain
    const adminEmail = doc.email || `admin@${doc.subdomain}.local`;

    // Create the admin for this tenant
    const admin = await Admin.create({
      tenantId: doc._id,
      firstName: firstName,
      lastName: lastName,
      email: adminEmail.toLowerCase().trim(),
      phone: doc.phone || undefined,
      department: 'Administration',
      accessLevel: 'full',
      status: doc.status === 'active' ? 'active' : 'inactive',
    });

    console.log(`✅ Created admin for tenant: ${doc.name} (${doc.subdomain}) - Email: ${adminEmail}`);
    console.log(`   Admin ID: ${admin._id}, Tenant ID: ${doc._id}`);
    
    // Note: The Admin's post-save hook will automatically create a User account
    // The User will be linked to the admin role found/created above
  } catch (error: any) {
    // Log error but don't throw - we don't want to prevent tenant creation if admin creation fails
    console.error(`⚠️  Error creating admin for tenant ${doc.name} (${doc.subdomain}):`, error.message);
  }
});

// Prevent re-compilation during development
const Tenant = mongoose.models.Tenant || mongoose.model<ITenant>('Tenant', TenantSchema);


export default Tenant;

