import connectDB from './mongodb';
import Settings from '@/models/Settings';

let cachedSettings: any = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get settings from database (server-side only)
 * Uses caching to avoid repeated database calls
 * @param tenantId Optional tenant ID to get tenant-specific settings
 */
export async function getSettings(tenantId?: string | null) {
  // Return cached settings if still valid (but only if same tenant)
  const now = Date.now();
  const cacheKey = tenantId || 'default';
  if (cachedSettings && cachedSettings._cacheKey === cacheKey && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedSettings;
  }

  try {
    await connectDB();
    
    // Get tenant-specific settings if tenantId provided
    let settings;
    if (tenantId) {
      const { Types } = await import('mongoose');
      settings = await Settings.findOne({ tenantId: new Types.ObjectId(tenantId) });
    } else {
      // Get settings without tenant (for backward compatibility)
      settings = await Settings.findOne({ 
        $or: [{ tenantId: { $exists: false } }, { tenantId: null }] 
      });
    }
    
    if (!settings) {
      // Create default settings if none exist - use full default values
      const defaultSettingsData = getDefaultSettings();
      const settingsData: any = {
        ...defaultSettingsData,
      };
      if (tenantId) {
        const { Types } = await import('mongoose');
        settingsData.tenantId = new Types.ObjectId(tenantId);
      }
      settings = await Settings.create(settingsData);
    }
    
    // Merge with defaults to ensure all fields are present (in case schema changed)
    const defaultSettingsData = getDefaultSettings();
    const settingsObj = {
      ...defaultSettingsData,
      ...settings.toObject(),
    };
    
    // Cache the merged settings with tenant key
    cachedSettings = { ...settingsObj, _cacheKey: cacheKey };
    cacheTimestamp = now;
    
    // Return a Mongoose-like object with the merged data
    return settingsObj as any;
  } catch (error) {
    console.error('Error fetching settings:', error);
    // Return default settings if database fails
    return getDefaultSettings();
  }
}

/**
 * Get default settings (fallback)
 */
/**
 * Get default settings (fallback)
 * This is the single source of truth for default settings values
 * Used throughout the application when settings don't exist or need defaults
 */
export function getDefaultSettings() {
  return {
    clinicName: 'Clinic Management System',
    clinicAddress: '',
    clinicPhone: '',
    clinicEmail: '',
    clinicWebsite: '',
    taxId: '',
    licenseNumber: '',
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
      currency: 'PHP',
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

