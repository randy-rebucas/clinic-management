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
  ptr?: string;

  // Business Hours
  businessHours: IBusinessHours[];

  // Appointment Settings
  appointmentSettings: {
    defaultDuration: number; // minutes
    reminderHoursBefore: number[]; // e.g., [24, 2] for 24 hours and 2 hours before
    allowOnlineBooking: boolean;
    /** Patients may book video visits from the app (also needs the teleconsult plan feature). */
    teleconsultBooking: boolean;
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
    /** Patients may check themselves in from the eMCR app by scanning the clinic check-in QR. */
    patientSelfCheckIn: boolean;
    /** YouTube video ids the waiting-room screen plays (lib/queue-media.ts). */
    displayVideos: string[];
    /** Ad image addresses the waiting-room screen shows. */
    displayAds: string[];
    /**
     * Every ad image stored on Cloudinary for the clinic, shown or not yet saved, with its size:
     * counted in storage use, and removed from Cloudinary once it leaves displayAds. Written by
     * the ad upload route and the settings route only, never from the settings form.
     */
    displayAdFiles?: { url: string; bytes: number; uploadedAt: Date }[];
    /** How much of a patient's name the waiting-room screen shows. */
    displayNames: 'first-initial' | 'initials' | 'number';
    /** Group the waiting-room screen by doctor. */
    displayByDoctor: boolean;
    /** A message scrolling along the bottom of the waiting-room screen. */
    displayTicker: string;
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
    twilioEnabled: boolean;
    smtpEnabled: boolean;
  };

  // Automation Settings
  automationSettings: {
    autoInvoiceGeneration: boolean;
    autoPaymentReminders: boolean;
    autoLowStockAlerts: boolean;
    autoLabNotifications: boolean;
    autoExpiryMonitoring: boolean;
    autoAppointmentConfirmation: boolean;
    autoPrescriptionRefills: boolean;
    autoFollowupScheduling: boolean;
    autoDailyReports: boolean;
    autoWelcomeMessages: boolean;
    autoVisitSummaries: boolean;
    autoNoShowHandling: boolean;
    autoWaitlistManagement: boolean;
    autoBirthdayGreetings: boolean;
    autoHealthReminders: boolean;
    autoFeedbackCollection: boolean;
    autoRecurringAppointments: boolean;
    autoMedicationAdherence: boolean;
    autoBroadcastMessaging: boolean;
    autoPeriodicReports: boolean;
    autoStaffPerformanceReports: boolean;
    autoInsuranceVerification: boolean;
    autoQueueOptimization: boolean;
    autoCallNextPatient: boolean;
    autoDataRetention: boolean;
    autoSmartAssignment: boolean;
    autoInventoryReordering: boolean;
    autoPrescriptionExpiryWarnings: boolean;
    autoDocumentExpiryTracking: boolean;
    autoCancellationPolicies: boolean;
    autoFrontDeskCatchUp: boolean;
  };

  // Display Settings
  displaySettings: {
    theme: 'light' | 'dark' | 'auto';
    sidebarCollapsed: boolean;
    showNotifications: boolean;
  };

  // Prescription Settings
  prescriptionDigitalSignatureEnabled?: boolean;
  prescriptionPaperSize?: 'A5' | 'A4';

  // PhilHealth claims (lib/philhealth.ts)
  philhealthSettings?: { enabled: boolean; hciAccreditationNo: string; filingDays: number };

  // BIR invoicing (lib/bir.ts)
  birSettings?: {
    enabled: boolean;
    regime: 'vat' | 'non_vat';
    vatRate: number;
    pricesIncludeVat: boolean;
    professionalFeeVatClass: 'vatable' | 'exempt' | 'zero_rated';
    registeredName?: string;
    branchCode: string;
    permitNumber?: string;
    permitIssuedOn?: string;
    serialPrefix?: string;
    serialStart: number;
    serialEnd: number;
  };

  // Medical-rep visiting hours (lib/rep-visit-rules.ts; read through normalizeRepVisitSettings)
  repVisitSettings?: unknown;

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
      default: 'MyClinicSoft',
    },
    clinicAddress: { type: String, default: '' },
    clinicPhone: { type: String, default: '' },
    clinicEmail: { type: String, default: '' },
    clinicWebsite: { type: String, default: '' },
    taxId: { type: String, default: '' },
    licenseNumber: { type: String, default: '' },
    ptr: { type: String, default: '' },

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
      teleconsultBooking: { type: Boolean, default: false },
      requireConfirmation: { type: Boolean, default: false },
      maxAdvanceBookingDays: { type: Number, default: 90 },
      minAdvanceBookingHours: { type: Number, default: 2 },
    },

    communicationSettings: {
      smsEnabled: { type: Boolean, default: true },
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
      patientSelfCheckIn: { type: Boolean, default: false },
      displayVideos: { type: [String], default: [] },
      displayAds: { type: [String], default: [] },
      displayAdFiles: {
        type: [new Schema({ url: { type: String, required: true }, bytes: { type: Number, default: 0 }, uploadedAt: { type: Date, default: Date.now } }, { _id: false })],
        default: undefined,
      },
      displayNames: { type: String, enum: ['first-initial', 'initials', 'number'], default: 'first-initial' },
      displayByDoctor: { type: Boolean, default: false },
      displayTicker: { type: String, default: '' },
    },

    generalSettings: {
      timezone: { type: String, default: 'Asia/Manila' },
      dateFormat: { type: String, default: 'MM/DD/YYYY' },
      timeFormat: { type: String, enum: ['12h', '24h'], default: '12h' },
      itemsPerPage: { type: Number, default: 20 },
      enableAuditLog: { type: Boolean, default: true },
      sessionTimeoutMinutes: { type: Number, default: 480 }, // 8 hours
    },

    integrationSettings: {
      twilioEnabled: { type: Boolean, default: false },
      smtpEnabled: { type: Boolean, default: false },
    },

    automationSettings: {
      autoInvoiceGeneration: { type: Boolean, default: true },
      autoPaymentReminders: { type: Boolean, default: true },
      autoLowStockAlerts: { type: Boolean, default: true },
      autoLabNotifications: { type: Boolean, default: true },
      autoExpiryMonitoring: { type: Boolean, default: true },
      autoAppointmentConfirmation: { type: Boolean, default: true },
      autoPrescriptionRefills: { type: Boolean, default: true },
      autoFollowupScheduling: { type: Boolean, default: true },
      autoDailyReports: { type: Boolean, default: true },
      autoWelcomeMessages: { type: Boolean, default: true },
      autoVisitSummaries: { type: Boolean, default: true },
      autoNoShowHandling: { type: Boolean, default: true },
      autoWaitlistManagement: { type: Boolean, default: true },
      autoBirthdayGreetings: { type: Boolean, default: true },
      autoHealthReminders: { type: Boolean, default: true },
      autoFeedbackCollection: { type: Boolean, default: true },
      autoRecurringAppointments: { type: Boolean, default: true },
      autoMedicationAdherence: { type: Boolean, default: true },
      autoBroadcastMessaging: { type: Boolean, default: true },
      autoPeriodicReports: { type: Boolean, default: true },
      autoStaffPerformanceReports: { type: Boolean, default: true },
      autoInsuranceVerification: { type: Boolean, default: true },
      autoQueueOptimization: { type: Boolean, default: false },
      autoCallNextPatient: { type: Boolean, default: false },
      autoDataRetention: { type: Boolean, default: true },
      // New Priority 1 automations
      autoSmartAssignment: { type: Boolean, default: true },
      autoInventoryReordering: { type: Boolean, default: true },
      autoPrescriptionExpiryWarnings: { type: Boolean, default: true },
      autoDocumentExpiryTracking: { type: Boolean, default: true },
      autoCancellationPolicies: { type: Boolean, default: true },
      autoFrontDeskCatchUp: { type: Boolean, default: true },
    },

    displaySettings: {
      theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'light' },
      sidebarCollapsed: { type: Boolean, default: false },
      showNotifications: { type: Boolean, default: true },
    },
    // Prescription Settings
    prescriptionDigitalSignatureEnabled: { type: Boolean, default: true },
    prescriptionPaperSize: { type: String, enum: ['A5', 'A4'], default: 'A4' },

    philhealthSettings: {
      enabled: { type: Boolean, default: false },
      hciAccreditationNo: { type: String, default: '' },
      filingDays: { type: Number, default: 60, min: 1, max: 365 },
    },

    birSettings: {
      enabled: { type: Boolean, default: false },
      regime: { type: String, enum: ['vat', 'non_vat'], default: 'non_vat' },
      vatRate: { type: Number, default: 12, min: 0, max: 100 },
      pricesIncludeVat: { type: Boolean, default: true },
      professionalFeeVatClass: { type: String, enum: ['vatable', 'exempt', 'zero_rated'], default: 'vatable' },
      registeredName: { type: String, default: '' },
      branchCode: { type: String, default: '00000' },
      permitNumber: { type: String, default: '' },
      permitIssuedOn: { type: String, default: '' },
      serialPrefix: { type: String, default: '' },
      serialStart: { type: Number, default: 1, min: 1 },
      serialEnd: { type: Number, default: 0, min: 0 },
    },

    // Validated by repVisitSettingsSchema when saved.
    repVisitSettings: { type: Schema.Types.Mixed },
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

