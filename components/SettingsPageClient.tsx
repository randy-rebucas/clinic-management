'use client';

import { useEffect, useState } from 'react';

interface Settings {
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
  integrationStatus?: {
    twilio: boolean;
    smtp: boolean;
    cloudinary: boolean;
  };
  displaySettings: {
    theme: 'light' | 'dark' | 'auto';
    sidebarCollapsed: boolean;
    showNotifications: boolean;
  };
}

interface SettingsPageClientProps {
  user: {
    role: string;
    [key: string]: any;
  };
}

const DAYS = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

// Default settings - matches getDefaultSettings() from lib/settings.ts
// Used as fallback when API fails
const defaultSettingsFallback: Settings = {
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
    sidebarCollapsed: false,
    showNotifications: true,
  },
};

// Helper component for labeled TextField
const LabeledTextField = ({ 
  label, 
  value, 
  onChange, 
  disabled, 
  type = 'text',
  step,
  placeholder
}: { 
  label: string; 
  value: string | number; 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; 
  disabled?: boolean;
  type?: string;
  step?: string;
  placeholder?: string;
}) => (
  <div>
    <label className="block text-sm font-medium mb-1">{label}</label>
    <input
      type={type}
      step={step}
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
    />
  </div>
);

export default function SettingsPageClient({ user }: SettingsPageClientProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState('clinic');
  const isAdmin = user.role === 'admin';

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        // API now returns settings merged with defaults, so we can use it directly
        setSettings(data as Settings);
      } else {
        // If fetch fails, use default settings
        setSettings(defaultSettingsFallback);
        setMessage({ type: 'error', text: 'Failed to load settings, using defaults' });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      // Use default settings on error
      setSettings(defaultSettingsFallback);
      setMessage({ type: 'error', text: 'Failed to load settings, using defaults' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings || !isAdmin) return;

    try {
      setSaving(true);
      setMessage(null);

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Settings saved successfully' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || 'Failed to save settings' });
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const updateSettings = (path: string, value: any) => {
    if (!settings) return;

    const keys = path.split('.');
    const newSettings = { ...settings };
    let current: any = newSettings;

    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = { ...current[keys[i]] };
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    setSettings(newSettings);
  };

  const updateBusinessHours = (day: string, field: string, value: any) => {
    if (!settings) return;

    const newSettings = { ...settings };
    const dayIndex = newSettings.businessHours.findIndex((h) => h.day === day);
    if (dayIndex !== -1) {
      newSettings.businessHours = [...newSettings.businessHours];
      newSettings.businessHours[dayIndex] = {
        ...newSettings.businessHours[dayIndex],
        [field]: value,
      };
      setSettings(newSettings);
    }
  };

  if (loading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-center items-center" style={{ minHeight: '400px' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </section>
    );
  }

  if (!settings) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">Failed to load settings</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-slate-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-slate-500 to-slate-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Settings</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Manage clinic settings and preferences</p>
                </div>
              </div>
              {isAdmin && (
                <button 
                  onClick={handleSave} 
                  disabled={saving} 
                  className="px-5 py-2.5 bg-gradient-to-r from-slate-500 to-slate-600 text-white rounded-lg hover:from-slate-600 hover:to-slate-700 disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-not-allowed transition-all text-sm font-semibold flex items-center gap-2 shadow-md"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save Changes
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

        {/* Messages */}
        {message && (
          <div className={`rounded-xl p-4 shadow-sm ${
            message.type === 'success' 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-center gap-3">
              {message.type === 'success' ? (
                <div className="p-1.5 bg-green-500 rounded-lg flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : (
                <div className="p-1.5 bg-red-500 rounded-lg flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              )}
              <p className={`text-sm font-semibold ${message.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>{message.text}</p>
            </div>
          </div>
        )}

        {!isAdmin && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-yellow-500 rounded-lg flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-sm text-yellow-800 font-semibold">You can view settings but only admins can make changes.</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="border-b border-gray-200 overflow-x-auto">
            <nav className="flex -mb-px min-w-max">
              {['clinic', 'hours', 'appointments', 'communication', 'billing', 'queue', 'general', 'display', 'integrations'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab === 'clinic' ? 'Clinic Info' :
                   tab === 'hours' ? 'Business Hours' :
                   tab === 'appointments' ? 'Appointments' :
                   tab === 'communication' ? 'Communication' :
                   tab === 'billing' ? 'Billing' :
                   tab === 'queue' ? 'Queue' :
                   tab === 'general' ? 'General' :
                   tab === 'display' ? 'Display' :
                   'Integrations'}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'clinic' && (
              <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 bg-blue-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Clinic Information</h3>
                </div>
                <div className="flex flex-col gap-4">
                  <LabeledTextField
                    label="Clinic Name"
                    value={settings.clinicName || ''}
                    onChange={(e) => updateSettings('clinicName', e.target.value)}
                    disabled={!isAdmin}
                    placeholder="Enter clinic name"
                  />
                  <LabeledTextField
                    label="Address"
                    value={settings.clinicAddress || ''}
                    onChange={(e) => updateSettings('clinicAddress', e.target.value)}
                    disabled={!isAdmin}
                    placeholder="Enter clinic address"
                  />
                  <LabeledTextField
                    label="Phone"
                    value={settings.clinicPhone || ''}
                    onChange={(e) => updateSettings('clinicPhone', e.target.value)}
                    disabled={!isAdmin}
                    placeholder="Enter phone number"
                  />
                  <LabeledTextField
                    label="Email"
                    type="email"
                    value={settings.clinicEmail || ''}
                    onChange={(e) => updateSettings('clinicEmail', e.target.value)}
                    disabled={!isAdmin}
                    placeholder="Enter email address"
                  />
                  <LabeledTextField
                    label="Website"
                    value={settings.clinicWebsite || ''}
                    onChange={(e) => updateSettings('clinicWebsite', e.target.value)}
                    disabled={!isAdmin}
                    placeholder="https://example.com"
                  />
                  <LabeledTextField
                    label="Tax ID"
                    value={settings.taxId || ''}
                    onChange={(e) => updateSettings('taxId', e.target.value)}
                    disabled={!isAdmin}
                    placeholder="Enter tax ID"
                  />
                  <LabeledTextField
                    label="License Number"
                    value={settings.licenseNumber || ''}
                    onChange={(e) => updateSettings('licenseNumber', e.target.value)}
                    disabled={!isAdmin}
                    placeholder="Enter license number"
                  />
                </div>
              </div>
            )}

            {activeTab === 'hours' && (
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 bg-emerald-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Business Hours</h3>
                </div>
                <div className="flex flex-col gap-4">
                  {DAYS.map((day) => {
                    const hours = settings.businessHours.find((h) => h.day === day.value);
                    if (!hours) return null;

                    return (
                      <div key={day.value} className="flex gap-3 items-center flex-wrap">
                        <div className="w-[100px] flex-shrink-0">
                          <p className="text-sm font-medium">{day.label}</p>
                        </div>
                        <div className="flex gap-2 items-center">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!hours.closed}
                              onChange={(e) => updateBusinessHours(day.value, 'closed', !e.target.checked)}
                              disabled={!isAdmin}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"></div>
                          </label>
                          <p className="text-sm text-gray-600">
                            {hours.closed ? 'Closed' : 'Open'}
                          </p>
                        </div>
                        {!hours.closed && (
                          <div className="flex gap-2 items-center flex-1 min-w-[200px]">
                            <input
                              type="time"
                              value={hours.open}
                              onChange={(e) => updateBusinessHours(day.value, 'open', e.target.value)}
                              disabled={!isAdmin}
                              className="w-[140px] flex-shrink-0 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                            <p className="text-sm text-gray-600">to</p>
                            <input
                              type="time"
                              value={hours.close}
                              onChange={(e) => updateBusinessHours(day.value, 'close', e.target.value)}
                              disabled={!isAdmin}
                              className="w-[140px] flex-shrink-0 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'appointments' && (
              <div className="bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex flex-col gap-4 p-4">
                  <h3 className="text-xl font-semibold">Appointment Settings</h3>
                  <LabeledTextField
                    label="Default Duration (minutes)"
                    type="number"
                    value={settings.appointmentSettings.defaultDuration ?? 30}
                    onChange={(e) => updateSettings('appointmentSettings.defaultDuration', parseInt(e.target.value) || 30)}
                    disabled={!isAdmin}
                    placeholder="30"
                  />
                  <LabeledTextField
                    label="Reminder Hours Before (comma-separated)"
                    value={settings.appointmentSettings.reminderHoursBefore?.join(', ') || '24, 2'}
                    onChange={(e) => {
                      const hours = e.target.value.split(',').map((h) => parseInt(h.trim())).filter((h) => !isNaN(h));
                      updateSettings('appointmentSettings.reminderHoursBefore', hours.length > 0 ? hours : [24, 2]);
                    }}
                    disabled={!isAdmin}
                    placeholder="24, 2"
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.appointmentSettings.allowOnlineBooking}
                      onChange={(e) => updateSettings('appointmentSettings.allowOnlineBooking', e.target.checked)}
                      disabled={!isAdmin}
                      className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm">Allow Online Booking</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.appointmentSettings.requireConfirmation}
                      onChange={(e) => updateSettings('appointmentSettings.requireConfirmation', e.target.checked)}
                      disabled={!isAdmin}
                      className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm">Require Confirmation</span>
                  </label>
                  <LabeledTextField
                    label="Max Advance Booking (days)"
                    type="number"
                    value={settings.appointmentSettings.maxAdvanceBookingDays ?? 90}
                    onChange={(e) => updateSettings('appointmentSettings.maxAdvanceBookingDays', parseInt(e.target.value) || 90)}
                    disabled={!isAdmin}
                    placeholder="90"
                  />
                  <LabeledTextField
                    label="Min Advance Booking (hours)"
                    type="number"
                    value={settings.appointmentSettings.minAdvanceBookingHours ?? 2}
                    onChange={(e) => updateSettings('appointmentSettings.minAdvanceBookingHours', parseInt(e.target.value) || 2)}
                    disabled={!isAdmin}
                    placeholder="2"
                  />
                </div>
              </div>
            )}

            {activeTab === 'communication' && (
              <div className="bg-gradient-to-br from-cyan-50 to-cyan-100/50 border border-cyan-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 bg-cyan-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Communication Settings</h3>
                </div>
                <div className="flex flex-col gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.communicationSettings.smsEnabled}
                      onChange={(e) => updateSettings('communicationSettings.smsEnabled', e.target.checked)}
                      disabled={!isAdmin}
                      className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm">SMS Enabled</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.communicationSettings.emailEnabled}
                      onChange={(e) => updateSettings('communicationSettings.emailEnabled', e.target.checked)}
                      disabled={!isAdmin}
                      className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm">Email Enabled</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.communicationSettings.appointmentReminders}
                      onChange={(e) => updateSettings('communicationSettings.appointmentReminders', e.target.checked)}
                      disabled={!isAdmin}
                      className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm">Appointment Reminders</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.communicationSettings.labResultNotifications}
                      onChange={(e) => updateSettings('communicationSettings.labResultNotifications', e.target.checked)}
                      disabled={!isAdmin}
                      className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm">Lab Result Notifications</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.communicationSettings.invoiceReminders}
                      onChange={(e) => updateSettings('communicationSettings.invoiceReminders', e.target.checked)}
                      disabled={!isAdmin}
                      className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm">Invoice Reminders</span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'billing' && (
              <div className="bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex flex-col gap-4 p-4">
                  <h3 className="text-xl font-semibold">Billing Settings</h3>
                  <LabeledTextField
                    label="Currency"
                    value={settings.billingSettings.currency || 'PHP'}
                    onChange={(e) => updateSettings('billingSettings.currency', e.target.value)}
                    disabled={!isAdmin}
                    placeholder="PHP"
                  />
                  <LabeledTextField
                    label="Tax Rate (%)"
                    type="number"
                    step="0.01"
                    value={settings.billingSettings.taxRate ?? 0}
                    onChange={(e) => updateSettings('billingSettings.taxRate', parseFloat(e.target.value) || 0)}
                    disabled={!isAdmin}
                    placeholder="0.00"
                  />
                  <LabeledTextField
                    label="Payment Terms (days)"
                    type="number"
                    value={settings.billingSettings.paymentTerms ?? 30}
                    onChange={(e) => updateSettings('billingSettings.paymentTerms', parseInt(e.target.value) || 30)}
                    disabled={!isAdmin}
                    placeholder="30"
                  />
                  <LabeledTextField
                    label="Late Fee Percentage (%)"
                    type="number"
                    step="0.01"
                    value={settings.billingSettings.lateFeePercentage ?? 0}
                    onChange={(e) => updateSettings('billingSettings.lateFeePercentage', parseFloat(e.target.value) || 0)}
                    disabled={!isAdmin}
                    placeholder="0.00"
                  />
                  <LabeledTextField
                    label="Invoice Prefix"
                    value={settings.billingSettings.invoicePrefix || 'INV'}
                    onChange={(e) => updateSettings('billingSettings.invoicePrefix', e.target.value)}
                    disabled={!isAdmin}
                    placeholder="INV"
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.billingSettings.allowPartialPayments}
                      onChange={(e) => updateSettings('billingSettings.allowPartialPayments', e.target.checked)}
                      disabled={!isAdmin}
                      className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm">Allow Partial Payments</span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'queue' && (
              <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 bg-purple-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Queue Settings</h3>
                </div>
                <div className="flex flex-col gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.queueSettings.enableQueue}
                      onChange={(e) => updateSettings('queueSettings.enableQueue', e.target.checked)}
                      disabled={!isAdmin}
                      className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm">Enable Queue</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.queueSettings.autoAssignRooms}
                      onChange={(e) => updateSettings('queueSettings.autoAssignRooms', e.target.checked)}
                      disabled={!isAdmin}
                      className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm">Auto Assign Rooms</span>
                  </label>
                  <LabeledTextField
                    label="Estimated Wait Time (minutes)"
                    type="number"
                    value={settings.queueSettings.estimatedWaitTimeMinutes ?? 15}
                    onChange={(e) => updateSettings('queueSettings.estimatedWaitTimeMinutes', parseInt(e.target.value) || 15)}
                    disabled={!isAdmin}
                    placeholder="15"
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.queueSettings.displayQueuePublicly}
                      onChange={(e) => updateSettings('queueSettings.displayQueuePublicly', e.target.checked)}
                      disabled={!isAdmin}
                      className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm">Display Queue Publicly</span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'general' && (
              <div className="bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex flex-col gap-4 p-4">
                  <h3 className="text-xl font-semibold">General Settings</h3>
                  <LabeledTextField
                    label="Timezone"
                    value={settings.generalSettings.timezone || 'UTC'}
                    onChange={(e) => updateSettings('generalSettings.timezone', e.target.value)}
                    disabled={!isAdmin}
                    placeholder="UTC"
                  />
                  <div>
                    <label className="block text-sm font-medium mb-1">Date Format</label>
                    <select
                      value={settings.generalSettings.dateFormat}
                      onChange={(e) => updateSettings('generalSettings.dateFormat', e.target.value)}
                      disabled={!isAdmin}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Time Format</label>
                    <select
                      value={settings.generalSettings.timeFormat}
                      onChange={(e) => updateSettings('generalSettings.timeFormat', e.target.value as '12h' | '24h')}
                      disabled={!isAdmin}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="12h">12 Hour</option>
                      <option value="24h">24 Hour</option>
                    </select>
                  </div>
                  <LabeledTextField
                    label="Items Per Page"
                    type="number"
                    value={settings.generalSettings.itemsPerPage ?? 20}
                    onChange={(e) => updateSettings('generalSettings.itemsPerPage', parseInt(e.target.value) || 20)}
                    disabled={!isAdmin}
                    placeholder="20"
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.generalSettings.enableAuditLog}
                      onChange={(e) => updateSettings('generalSettings.enableAuditLog', e.target.checked)}
                      disabled={!isAdmin}
                      className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm">Enable Audit Log</span>
                  </label>
                  <LabeledTextField
                    label="Session Timeout (minutes)"
                    type="number"
                    value={settings.generalSettings.sessionTimeoutMinutes ?? 480}
                    onChange={(e) => updateSettings('generalSettings.sessionTimeoutMinutes', parseInt(e.target.value) || 480)}
                    disabled={!isAdmin}
                    placeholder="480"
                  />
                </div>
              </div>
            )}

            {activeTab === 'display' && (
              <div className="bg-gradient-to-br from-violet-50 to-violet-100/50 border border-violet-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 bg-violet-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Display Settings</h3>
                </div>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Theme</label>
                    <select
                      value={settings.displaySettings.theme}
                      onChange={(e) => updateSettings('displaySettings.theme', e.target.value as 'light' | 'dark' | 'auto')}
                      disabled={!isAdmin}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                      <option value="auto">Auto</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.displaySettings.sidebarCollapsed}
                      onChange={(e) => updateSettings('displaySettings.sidebarCollapsed', e.target.checked)}
                      disabled={!isAdmin}
                      className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm">Sidebar Collapsed by Default</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.displaySettings.showNotifications}
                      onChange={(e) => updateSettings('displaySettings.showNotifications', e.target.checked)}
                      disabled={!isAdmin}
                      className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm">Show Notifications</span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'integrations' && (
              <div className="flex flex-col gap-4">
                {/* Twilio Integration */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-5">
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500 rounded-lg">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900 mb-1">Twilio (SMS)</h3>
                          <p className="text-sm text-gray-600">Configure SMS notifications via Twilio</p>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        {settings.integrationStatus?.twilio ? (
                          <div className="bg-green-50 border-2 border-green-300 rounded-full px-3 py-1.5 flex items-center gap-2">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <p className="text-xs font-semibold text-green-800">Configured</p>
                          </div>
                        ) : (
                          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-full px-3 py-1.5 flex items-center gap-2">
                            <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <p className="text-xs font-semibold text-yellow-800">Not Configured</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <hr className="border-gray-200" />
                    <div>
                      <p className="text-sm font-medium mb-2">Required Environment Variables</p>
                      <div className="flex flex-col gap-2">
                        <p className="text-xs text-gray-600 font-mono">
                          TWILIO_ACCOUNT_SID
                        </p>
                        <p className="text-xs text-gray-600 font-mono">
                          TWILIO_AUTH_TOKEN
                        </p>
                        <p className="text-xs text-gray-600 font-mono">
                          TWILIO_PHONE_NUMBER
                        </p>
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-blue-800">
                        Add these variables to your <code className="font-mono text-xs bg-blue-100 px-1 py-0.5 rounded">.env.local</code> file and restart the server.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.integrationSettings.twilioEnabled}
                        onChange={(e) => updateSettings('integrationSettings.twilioEnabled', e.target.checked)}
                        disabled={!isAdmin}
                        className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <span className="text-sm">Enable Twilio Integration</span>
                    </label>
                  </div>
                </div>

                {/* SMTP Integration */}
                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200 rounded-xl p-5">
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500 rounded-lg">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900 mb-1">SMTP (Email)</h3>
                          <p className="text-sm text-gray-600">Configure email notifications via SMTP</p>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        {settings.integrationStatus?.smtp ? (
                          <div className="bg-green-50 border-2 border-green-300 rounded-full px-3 py-1.5 flex items-center gap-2">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <p className="text-xs font-semibold text-green-800">Configured</p>
                          </div>
                        ) : (
                          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-full px-3 py-1.5 flex items-center gap-2">
                            <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <p className="text-xs font-semibold text-yellow-800">Not Configured</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <hr className="border-gray-200" />
                    <div>
                      <p className="text-sm font-medium mb-2">Required Environment Variables</p>
                      <div className="flex flex-col gap-2">
                        <p className="text-xs text-gray-600 font-mono">
                          SMTP_HOST
                        </p>
                        <p className="text-xs text-gray-600 font-mono">
                          SMTP_PORT
                        </p>
                        <p className="text-xs text-gray-600 font-mono">
                          SMTP_USER
                        </p>
                        <p className="text-xs text-gray-600 font-mono">
                          SMTP_PASS
                        </p>
                        <p className="text-xs text-gray-600 font-mono">
                          SMTP_FROM (optional)
                        </p>
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-blue-800">
                        Add these variables to your <code className="font-mono text-xs bg-blue-100 px-1 py-0.5 rounded">.env.local</code> file and restart the server.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.integrationSettings.smtpEnabled}
                        onChange={(e) => updateSettings('integrationSettings.smtpEnabled', e.target.checked)}
                        disabled={!isAdmin}
                        className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <span className="text-sm">Enable SMTP Integration</span>
                    </label>
                  </div>
                </div>

                {/* Cloudinary Integration */}
                <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 border border-teal-200 rounded-xl p-5">
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-teal-500 rounded-lg">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900 mb-1">Cloudinary (File Storage)</h3>
                          <p className="text-sm text-gray-600">Configure document and image storage via Cloudinary</p>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center">
                        {settings.integrationStatus?.cloudinary ? (
                          <div className="bg-green-50 border-2 border-green-300 rounded-full px-3 py-1.5 flex items-center gap-2">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <p className="text-xs font-semibold text-green-800">Configured</p>
                          </div>
                        ) : (
                          <div className="bg-yellow-50 border-2 border-yellow-300 rounded-full px-3 py-1.5 flex items-center gap-2">
                            <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <p className="text-xs font-semibold text-yellow-800">Not Configured</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <hr className="border-gray-200" />
                    <div>
                      <p className="text-sm font-medium mb-2">Required Environment Variables</p>
                      <div className="flex flex-col gap-2">
                        <p className="text-xs text-gray-600 font-mono">
                          CLOUDINARY_CLOUD_NAME
                        </p>
                        <p className="text-xs text-gray-600 font-mono">
                          CLOUDINARY_API_KEY
                        </p>
                        <p className="text-xs text-gray-600 font-mono">
                          CLOUDINARY_API_SECRET
                        </p>
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-blue-800">
                        Add these variables to your <code className="font-mono text-xs bg-blue-100 px-1 py-0.5 rounded">.env.local</code> file and restart the server.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.integrationSettings.cloudinaryEnabled}
                        onChange={(e) => updateSettings('integrationSettings.cloudinaryEnabled', e.target.checked)}
                        disabled={!isAdmin}
                        className="w-4 h-4 text-slate-600 border-gray-300 rounded focus:ring-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <span className="text-sm">Enable Cloudinary Integration</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}
