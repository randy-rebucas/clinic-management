import mongoose, { Document, Schema, Types } from 'mongoose';

export type ITenantSettings = {
  timezone: string;
  currency: string;
  currencySymbol?: string;
  currencyPosition: 'before' | 'after'; // e.g., $100 or 100$
  dateFormat: string; // e.g., 'MM/DD/YYYY', 'DD/MM/YYYY'
  timeFormat: '12h' | '24h';
  language: 'en' | 'es';
  numberFormat: {
    decimalSeparator: string; // '.' or ','
    thousandsSeparator: string; // ',' or '.'
    decimalPlaces: number; // 2 for currency
  };
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
};

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
  settings?: ITenantSettings;
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

// Prevent re-compilation during development
const Tenant = mongoose.models.Tenant || mongoose.model<ITenant>('Tenant', TenantSchema);


export default Tenant;

