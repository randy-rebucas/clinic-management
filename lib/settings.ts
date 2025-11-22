import connectDB from './mongodb';
import Settings from '@/models/Settings';

let cachedSettings: any = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get settings from database (server-side only)
 * Uses caching to avoid repeated database calls
 */
export async function getSettings() {
  // Return cached settings if still valid
  const now = Date.now();
  if (cachedSettings && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedSettings;
  }

  try {
    await connectDB();
    
    // Get or create default settings
    let settings = await Settings.findOne();
    
    if (!settings) {
      // Create default settings if none exist
      settings = await Settings.create({});
    }
    
    // Cache the settings
    cachedSettings = settings;
    cacheTimestamp = now;
    
    return settings;
  } catch (error) {
    console.error('Error fetching settings:', error);
    // Return default settings if database fails
    return getDefaultSettings();
  }
}

/**
 * Get default settings (fallback)
 */
export function getDefaultSettings() {
  return {
    clinicName: 'Clinic Management System',
    clinicAddress: '',
    clinicPhone: '',
    clinicEmail: '',
    businessHours: [
      { day: 'monday', open: '09:00', close: '17:00', closed: false },
      { day: 'tuesday', open: '09:00', close: '17:00', closed: false },
      { day: 'wednesday', open: '09:00', close: '17:00', closed: false },
      { day: 'thursday', open: '09:00', close: '17:00', closed: false },
      { day: 'friday', open: '09:00', close: '17:00', closed: false },
      { day: 'saturday', open: '09:00', close: '13:00', closed: false },
      { day: 'sunday', open: '09:00', close: '13:00', closed: true },
    ],
    appointmentSettings: {
      defaultDuration: 30,
      reminderHoursBefore: [24, 2],
      allowOnlineBooking: true,
      requireConfirmation: false,
      maxAdvanceBookingDays: 90,
      minAdvanceBookingHours: 2,
    },
    communicationSettings: {
      smsEnabled: false,
      emailEnabled: false,
      appointmentReminders: true,
      labResultNotifications: true,
      invoiceReminders: true,
    },
    billingSettings: {
      currency: 'USD',
      taxRate: 0,
      paymentTerms: 30,
      lateFeePercentage: 0,
      invoicePrefix: 'INV',
      allowPartialPayments: true,
    },
    queueSettings: {
      enableQueue: true,
      autoAssignRooms: false,
      estimatedWaitTimeMinutes: 15,
      displayQueuePublicly: false,
    },
    generalSettings: {
      timezone: 'UTC',
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h' as const,
      itemsPerPage: 20,
      enableAuditLog: true,
      sessionTimeoutMinutes: 480,
    },
    integrationSettings: {
      cloudinaryEnabled: false,
      twilioEnabled: false,
      smtpEnabled: false,
    },
    displaySettings: {
      theme: 'light' as const,
      sidebarCollapsed: false,
      showNotifications: true,
    },
  };
}

/**
 * Clear settings cache (call after updating settings)
 */
export function clearSettingsCache() {
  cachedSettings = null;
  cacheTimestamp = 0;
}

