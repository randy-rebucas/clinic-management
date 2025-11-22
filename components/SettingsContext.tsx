'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface Settings {
  _id?: string;
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  clinicEmail: string;
  clinicWebsite?: string;
  taxId?: string;
  licenseNumber?: string;
  businessHours: Array<{
    day: string;
    open: string;
    close: string;
    closed: boolean;
  }>;
  appointmentSettings: {
    defaultDuration: number;
    reminderHoursBefore: number[];
    allowOnlineBooking: boolean;
    requireConfirmation: boolean;
    maxAdvanceBookingDays: number;
    minAdvanceBookingHours: number;
  };
  communicationSettings: {
    smsEnabled: boolean;
    emailEnabled: boolean;
    appointmentReminders: boolean;
    labResultNotifications: boolean;
    invoiceReminders: boolean;
  };
  billingSettings: {
    currency: string;
    taxRate: number;
    paymentTerms: number;
    lateFeePercentage: number;
    invoicePrefix: string;
    allowPartialPayments: boolean;
  };
  queueSettings: {
    enableQueue: boolean;
    autoAssignRooms: boolean;
    estimatedWaitTimeMinutes: number;
    displayQueuePublicly: boolean;
  };
  generalSettings: {
    timezone: string;
    dateFormat: string;
    timeFormat: '12h' | '24h';
    itemsPerPage: number;
    enableAuditLog: boolean;
    sessionTimeoutMinutes: number;
  };
  integrationSettings: {
    cloudinaryEnabled: boolean;
    twilioEnabled: boolean;
    smtpEnabled: boolean;
  };
  displaySettings: {
    theme: 'light' | 'dark' | 'auto';
    sidebarCollapsed: boolean;
    showNotifications: boolean;
  };
}

interface SettingsContextType {
  settings: Settings | null;
  loading: boolean;
  error: string | null;
  refreshSettings: () => Promise<void>;
}

const defaultSettings: Settings = {
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
    timeFormat: '12h',
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
    theme: 'light',
    sidebarCollapsed: true,
    showNotifications: true,
  },
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      } else {
        // Use default settings if fetch fails
        setSettings(defaultSettings);
        setError('Failed to load settings, using defaults');
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
      setSettings(defaultSettings);
      setError('Failed to load settings, using defaults');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSettings();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading, error, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

// Helper hook to get a specific setting value
export function useSetting<T>(path: string, defaultValue: T): T {
  const { settings } = useSettings();
  
  if (!settings) {
    return defaultValue;
  }

  const keys = path.split('.');
  let value: any = settings;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key as keyof typeof value];
    } else {
      return defaultValue;
    }
  }

  return value !== undefined && value !== null ? (value as T) : defaultValue;
}

