import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IBusinessHours {
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  open: string; // HH:mm format
  close: string; // HH:mm format
  closed: boolean;
}

export interface ISettings extends Document {
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;
  
  // Clinic Information
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  clinicEmail: string;
  clinicWebsite?: string;
  taxId?: string;
  licenseNumber?: string;

  // Business Hours
  businessHours: IBusinessHours[];

  // Appointment Settings
  appointmentSettings: {
    defaultDuration: number; // minutes
    reminderHoursBefore: number[]; // e.g., [24, 2] for 24 hours and 2 hours before
    allowOnlineBooking: boolean;
    requireConfirmation: boolean;
    maxAdvanceBookingDays: number;
    minAdvanceBookingHours: number;
  };

  // Communication Settings
  communicationSettings: {
    smsEnabled: boolean;
    emailEnabled: boolean;
    appointmentReminders: boolean;
    labResultNotifications: boolean;
    invoiceReminders: boolean;
  };

  // Invoice/Billing Settings
  billingSettings: {
    currency: string;
    taxRate: number; // percentage
    paymentTerms: number; // days
    lateFeePercentage: number; // percentage
    invoicePrefix: string;
    allowPartialPayments: boolean;
  };

  // Queue Settings
  queueSettings: {
    enableQueue: boolean;
    autoAssignRooms: boolean;
    estimatedWaitTimeMinutes: number;
    displayQueuePublicly: boolean;
  };

  // General Settings
  generalSettings: {
    timezone: string;
    dateFormat: string;
    timeFormat: '12h' | '24h';
    itemsPerPage: number;
    enableAuditLog: boolean;
    sessionTimeoutMinutes: number;
  };

  // Integration Settings
  integrationSettings: {
    cloudinaryEnabled: boolean;
    twilioEnabled: boolean;
    smtpEnabled: boolean;
  };

  // Display Settings
  displaySettings: {
    theme: 'light' | 'dark' | 'auto';
    sidebarCollapsed: boolean;
    showNotifications: boolean;
  };

  createdAt: Date;
  updatedAt: Date;
}

const BusinessHoursSchema = new Schema<IBusinessHours>({
  day: {
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    required: true,
  },
  open: { type: String, required: true },
  close: { type: String, required: true },
  closed: { type: Boolean, default: false },
}, { _id: false });

const SettingsSchema = new Schema<ISettings>(
  {
    // Tenant reference for multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
    },
    
    clinicName: {
      type: String,
      required: true,
      default: 'Clinic Management System',
    },
    clinicAddress: { type: String, default: '' },
    clinicPhone: { type: String, default: '' },
    clinicEmail: { type: String, default: '' },
    clinicWebsite: { type: String, default: '' },
    taxId: { type: String, default: '' },
    licenseNumber: { type: String, default: '' },

    businessHours: {
      type: [BusinessHoursSchema],
      default: [
        { day: 'monday', open: '09:00', close: '17:00', closed: false },
        { day: 'tuesday', open: '09:00', close: '17:00', closed: false },
        { day: 'wednesday', open: '09:00', close: '17:00', closed: false },
        { day: 'thursday', open: '09:00', close: '17:00', closed: false },
        { day: 'friday', open: '09:00', close: '17:00', closed: false },
        { day: 'saturday', open: '09:00', close: '13:00', closed: false },
        { day: 'sunday', open: '09:00', close: '13:00', closed: true },
      ],
    },

    appointmentSettings: {
      defaultDuration: { type: Number, default: 30 },
      reminderHoursBefore: { type: [Number], default: [24, 2] },
      allowOnlineBooking: { type: Boolean, default: true },
      requireConfirmation: { type: Boolean, default: false },
      maxAdvanceBookingDays: { type: Number, default: 90 },
      minAdvanceBookingHours: { type: Number, default: 2 },
    },

    communicationSettings: {
      smsEnabled: { type: Boolean, default: false },
      emailEnabled: { type: Boolean, default: false },
      appointmentReminders: { type: Boolean, default: true },
      labResultNotifications: { type: Boolean, default: true },
      invoiceReminders: { type: Boolean, default: true },
    },

    billingSettings: {
      currency: { type: String, default: 'PHP' },
      taxRate: { type: Number, default: 0 },
      paymentTerms: { type: Number, default: 30 },
      lateFeePercentage: { type: Number, default: 0 },
      invoicePrefix: { type: String, default: 'INV' },
      allowPartialPayments: { type: Boolean, default: true },
    },

    queueSettings: {
      enableQueue: { type: Boolean, default: true },
      autoAssignRooms: { type: Boolean, default: false },
      estimatedWaitTimeMinutes: { type: Number, default: 15 },
      displayQueuePublicly: { type: Boolean, default: false },
    },

    generalSettings: {
      timezone: { type: String, default: 'UTC' },
      dateFormat: { type: String, default: 'MM/DD/YYYY' },
      timeFormat: { type: String, enum: ['12h', '24h'], default: '12h' },
      itemsPerPage: { type: Number, default: 20 },
      enableAuditLog: { type: Boolean, default: true },
      sessionTimeoutMinutes: { type: Number, default: 480 }, // 8 hours
    },

    integrationSettings: {
      cloudinaryEnabled: { type: Boolean, default: false },
      twilioEnabled: { type: Boolean, default: false },
      smtpEnabled: { type: Boolean, default: false },
    },

    displaySettings: {
      theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'light' },
      sidebarCollapsed: { type: Boolean, default: true },
      showNotifications: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries (tenant-scoped)
SettingsSchema.index({ tenantId: 1 }, { unique: true, sparse: true }); // One settings per tenant

// Prevent re-compilation during development
const Settings = mongoose.models.Settings || mongoose.model<ISettings>('Settings', SettingsSchema);

export default Settings;

