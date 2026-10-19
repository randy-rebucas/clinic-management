import connectDB from './mongodb';
import Settings from '@/models/Settings';
import { BIR_DEFAULTS } from './bir';
import { PHILHEALTH_DEFAULTS } from './philhealth';

// Per-tenant cache. Kept short because other serverless instances can't be invalidated.
const settingsCache = new Map<string, { value: any; at: number }>();
const CACHE_DURATION = 60 * 1000; // 1 minute

/**
 * Get settings from database (server-side only)
 * Uses caching to avoid repeated database calls
 * @param tenantId Tenant ID. Always pass it: without one you get the tenant-less
 * legacy settings record, not the clinic's own settings.
 */
export async function getSettings(tenantIdInput?: string | { toString(): string } | null) {
  const tenantId: string | null = tenantIdInput ? String(tenantIdInput) : null;
  const now = Date.now();
  const cacheKey = tenantId || 'default';
  const hit = settingsCache.get(cacheKey);
  if (hit && now - hit.at < CACHE_DURATION) {
    return hit.value;
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
    
    settingsCache.set(cacheKey, { value: settingsObj, at: now });
    
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
    clinicName: 'MyClinicSoft',
    clinicAddress: '',
    clinicPhone: '',
    clinicEmail: '',
    clinicWebsite: '',
    taxId: '',
    licenseNumber: '',
    ptr: '',
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
      teleconsultBooking: false,
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
      patientSelfCheckIn: false,
    },
    generalSettings: {
      timezone: 'Asia/Manila',
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
    prescriptionPaperSize: 'A4' as 'A4' | 'A5',
    birSettings: { ...BIR_DEFAULTS },
    philhealthSettings: { ...PHILHEALTH_DEFAULTS },
  };
}

/**
 * Clear settings cache (call after updating settings)
 */
export function clearSettingsCache(tenantId?: string | null) {
  if (tenantId) settingsCache.delete(String(tenantId));
  else settingsCache.clear();
}

