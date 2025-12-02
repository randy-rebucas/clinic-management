import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITenant extends Document {
  // Tenant identification
  name: string;
  slug: string; // URL-friendly identifier (e.g., "clinic-abc", used in subdomain or path)
  
  // Organization details
  displayName?: string;
  description?: string;
  logo?: string;
  
  // Contact information
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  
  // Configuration
  settings?: {
    timezone?: string;
    locale?: string;
    currency?: string;
    dateFormat?: string;
    [key: string]: any; // Allow custom settings
  };
  
  // Subscription/Billing (optional)
  subscription?: {
    plan?: string;
    status?: 'active' | 'trial' | 'expired' | 'cancelled';
    expiresAt?: Date;
  };
  
  // Status
  status: 'active' | 'inactive' | 'suspended';
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

const TenantSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Tenant name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Tenant slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'],
      index: true,
    },
    displayName: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    logo: {
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
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
    subscription: {
      plan: { type: String, trim: true },
      status: {
        type: String,
        enum: ['active', 'trial', 'expired', 'cancelled'],
        default: 'active',
      },
      expiresAt: { type: Date },
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
TenantSchema.index({ slug: 1 }, { unique: true });
TenantSchema.index({ status: 1 });
TenantSchema.index({ 'subscription.status': 1 });

// Prevent re-compilation during development
const Tenant = mongoose.models.Tenant || mongoose.model<ITenant>('Tenant', TenantSchema);

export default Tenant;

