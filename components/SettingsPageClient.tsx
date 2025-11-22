'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Flex, Box, Text, TextField, Select, Separator, Heading, Switch, Tabs, Spinner, Callout, Container, Section } from '@radix-ui/themes';
import { CheckIcon, Cross2Icon } from '@radix-ui/react-icons';

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
  <Box>
    <Text size="2" weight="medium" mb="1" as="div">{label}</Text>
    <TextField.Root size="2">
      <input
        type={type}
        step={step}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        style={{ 
          all: 'unset', 
          flex: 1,
          width: '100%',
          minWidth: 0
        }}
      />
    </TextField.Root>
  </Box>
);

export default function SettingsPageClient({ user }: SettingsPageClientProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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
        // Ensure all fields have default values - apply defaults where values are missing or empty
        const settingsWithDefaults: Settings = {
          _id: data._id,
          clinicName: (data.clinicName && data.clinicName.trim()) || 'Clinic Management System',
          clinicAddress: data.clinicAddress || '',
          clinicPhone: data.clinicPhone || '',
          clinicEmail: data.clinicEmail || '',
          clinicWebsite: data.clinicWebsite || '',
          taxId: data.taxId || '',
          licenseNumber: data.licenseNumber || '',
          businessHours: (data.businessHours && data.businessHours.length > 0) ? data.businessHours : [
            { day: 'monday', open: '09:00', close: '17:00', closed: false },
            { day: 'tuesday', open: '09:00', close: '17:00', closed: false },
            { day: 'wednesday', open: '09:00', close: '17:00', closed: false },
            { day: 'thursday', open: '09:00', close: '17:00', closed: false },
            { day: 'friday', open: '09:00', close: '17:00', closed: false },
            { day: 'saturday', open: '09:00', close: '13:00', closed: false },
            { day: 'sunday', open: '09:00', close: '13:00', closed: true },
          ],
          appointmentSettings: {
            defaultDuration: data.appointmentSettings?.defaultDuration ?? 30,
            reminderHoursBefore: data.appointmentSettings?.reminderHoursBefore ?? [24, 2],
            allowOnlineBooking: data.appointmentSettings?.allowOnlineBooking ?? true,
            requireConfirmation: data.appointmentSettings?.requireConfirmation ?? false,
            maxAdvanceBookingDays: data.appointmentSettings?.maxAdvanceBookingDays ?? 90,
            minAdvanceBookingHours: data.appointmentSettings?.minAdvanceBookingHours ?? 2,
          },
          communicationSettings: {
            smsEnabled: data.communicationSettings?.smsEnabled ?? false,
            emailEnabled: data.communicationSettings?.emailEnabled ?? false,
            appointmentReminders: data.communicationSettings?.appointmentReminders ?? true,
            labResultNotifications: data.communicationSettings?.labResultNotifications ?? true,
            invoiceReminders: data.communicationSettings?.invoiceReminders ?? true,
          },
          billingSettings: {
            currency: (data.billingSettings?.currency && data.billingSettings.currency.trim()) || 'USD',
            taxRate: data.billingSettings?.taxRate ?? 0,
            paymentTerms: data.billingSettings?.paymentTerms ?? 30,
            lateFeePercentage: data.billingSettings?.lateFeePercentage ?? 0,
            invoicePrefix: (data.billingSettings?.invoicePrefix && data.billingSettings.invoicePrefix.trim()) || 'INV',
            allowPartialPayments: data.billingSettings?.allowPartialPayments ?? true,
          },
          queueSettings: {
            enableQueue: data.queueSettings?.enableQueue ?? true,
            autoAssignRooms: data.queueSettings?.autoAssignRooms ?? false,
            estimatedWaitTimeMinutes: data.queueSettings?.estimatedWaitTimeMinutes ?? 15,
            displayQueuePublicly: data.queueSettings?.displayQueuePublicly ?? false,
          },
          generalSettings: {
            timezone: (data.generalSettings?.timezone && data.generalSettings.timezone.trim()) || 'UTC',
            dateFormat: (data.generalSettings?.dateFormat && data.generalSettings.dateFormat.trim()) || 'MM/DD/YYYY',
            timeFormat: data.generalSettings?.timeFormat || '12h',
            itemsPerPage: data.generalSettings?.itemsPerPage ?? 20,
            enableAuditLog: data.generalSettings?.enableAuditLog ?? true,
            sessionTimeoutMinutes: data.generalSettings?.sessionTimeoutMinutes ?? 480,
          },
          integrationSettings: {
            cloudinaryEnabled: data.integrationSettings?.cloudinaryEnabled ?? false,
            twilioEnabled: data.integrationSettings?.twilioEnabled ?? false,
            smtpEnabled: data.integrationSettings?.smtpEnabled ?? false,
          },
          displaySettings: {
            theme: data.displaySettings?.theme || 'light',
            sidebarCollapsed: data.displaySettings?.sidebarCollapsed ?? true,
            showNotifications: data.displaySettings?.showNotifications ?? true,
          },
        };
        setSettings(settingsWithDefaults);
      } else {
        // If fetch fails, use default settings
        const defaultSettings: Settings = {
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
        setSettings(defaultSettings);
        setMessage({ type: 'error', text: 'Failed to load settings, using defaults' });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      // Use default settings on error
      const defaultSettings: Settings = {
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
      setSettings(defaultSettings);
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
      <Section size="3">
        <Container size="4">
          <Flex justify="center" align="center" style={{ minHeight: '400px' }}>
            <Spinner size="3" />
          </Flex>
        </Container>
      </Section>
    );
  }

  if (!settings) {
    return (
      <Section size="3">
        <Container size="4">
          <Callout.Root color="red" size="2">
            <Callout.Text>Failed to load settings</Callout.Text>
          </Callout.Root>
        </Container>
      </Section>
    );
  }

  return (
    <Section size="3">
      <Container size="4">
        <Flex direction="column" gap="4">
          <Flex justify="between" align="center" wrap="wrap" gap="3">
            <Box>
              <Heading size="8" mb="1">Settings</Heading>
              <Text size="2" color="gray">Manage clinic settings and preferences</Text>
            </Box>
            {isAdmin && (
              <Button 
                onClick={handleSave} 
                disabled={saving} 
                size="3"
                variant="solid"
                color="blue"
              >
                {saving ? <Spinner size="2" /> : 'Save Changes'}
              </Button>
            )}
          </Flex>
        {message && (
          <Callout.Root color={message.type === 'success' ? 'green' : 'red'} size="2">
            <Callout.Icon>
              {message.type === 'success' ? <CheckIcon /> : <Cross2Icon />}
            </Callout.Icon>
            <Callout.Text>{message.text}</Callout.Text>
          </Callout.Root>
        )}

        {!isAdmin && (
          <Callout.Root color="amber" size="2">
            <Callout.Text>You can view settings but only admins can make changes.</Callout.Text>
          </Callout.Root>
        )}

        <Tabs.Root defaultValue="clinic">
          <Tabs.List size="2">
            <Tabs.Trigger value="clinic">Clinic Info</Tabs.Trigger>
            <Tabs.Trigger value="hours">Business Hours</Tabs.Trigger>
            <Tabs.Trigger value="appointments">Appointments</Tabs.Trigger>
            <Tabs.Trigger value="communication">Communication</Tabs.Trigger>
            <Tabs.Trigger value="billing">Billing</Tabs.Trigger>
            <Tabs.Trigger value="queue">Queue</Tabs.Trigger>
            <Tabs.Trigger value="general">General</Tabs.Trigger>
            <Tabs.Trigger value="display">Display</Tabs.Trigger>
          </Tabs.List>

          <Box pt="3">
            <Tabs.Content value="clinic">
              <Card size="2" variant="surface">
                <Flex direction="column" gap="4" p="4">
                  <Heading size="5">Clinic Information</Heading>
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
                </Flex>
              </Card>
            </Tabs.Content>

            <Tabs.Content value="hours">
              <Card size="2" variant="surface">
                <Flex direction="column" gap="4" p="4">
                  <Heading size="5">Business Hours</Heading>
                  {DAYS.map((day) => {
                    const hours = settings.businessHours.find((h) => h.day === day.value);
                    if (!hours) return null;

                    return (
                      <Flex key={day.value} gap="3" align="center" wrap="wrap">
                        <Box width="100px" flexShrink="0">
                          <Text size="2" weight="medium">{day.label}</Text>
                        </Box>
                        <Flex gap="2" align="center">
                          <Switch
                            size="2"
                            checked={!hours.closed}
                            onCheckedChange={(checked) => updateBusinessHours(day.value, 'closed', !checked)}
                            disabled={!isAdmin}
                          />
                          <Text size="2" color="gray">
                            {hours.closed ? 'Closed' : 'Open'}
                          </Text>
                        </Flex>
                        {!hours.closed && (
                          <Flex gap="2" align="center" style={{ flex: 1, minWidth: '200px' }}>
                            <TextField.Root size="2" style={{ width: '140px', flexShrink: 0 }}>
                              <input
                                type="time"
                                value={hours.open}
                                onChange={(e) => updateBusinessHours(day.value, 'open', e.target.value)}
                                disabled={!isAdmin}
                                style={{ 
                                  border: 'none',
                                  outline: 'none',
                                  background: 'transparent',
                                  flex: 1,
                                  width: '100%',
                                  minWidth: 0,
                                  padding: '0',
                                  fontSize: 'inherit',
                                  fontFamily: 'inherit',
                                  color: 'inherit'
                                }}
                              />
                            </TextField.Root>
                            <Text size="2" color="gray">to</Text>
                            <TextField.Root size="2" style={{ width: '140px', flexShrink: 0 }}>
                              <input
                                type="time"
                                value={hours.close}
                                onChange={(e) => updateBusinessHours(day.value, 'close', e.target.value)}
                                disabled={!isAdmin}
                                style={{ 
                                  border: 'none',
                                  outline: 'none',
                                  background: 'transparent',
                                  flex: 1,
                                  width: '100%',
                                  minWidth: 0,
                                  padding: '0',
                                  fontSize: 'inherit',
                                  fontFamily: 'inherit',
                                  color: 'inherit'
                                }}
                              />
                            </TextField.Root>
                          </Flex>
                        )}
                      </Flex>
                    );
                  })}
                </Flex>
              </Card>
            </Tabs.Content>

            <Tabs.Content value="appointments">
              <Card size="2" variant="surface">
                <Flex direction="column" gap="4" p="4">
                  <Heading size="5">Appointment Settings</Heading>
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
                  <Text as="label" size="2">
                    <Flex gap="2">
                      <Switch
                        size="2"
                        checked={settings.appointmentSettings.allowOnlineBooking}
                        onCheckedChange={(checked) => updateSettings('appointmentSettings.allowOnlineBooking', checked)}
                        disabled={!isAdmin}
                      />
                      Allow Online Booking
                    </Flex>
                  </Text>
                  <Text as="label" size="2">
                    <Flex gap="2">
                      <Switch
                        size="2"
                        checked={settings.appointmentSettings.requireConfirmation}
                        onCheckedChange={(checked) => updateSettings('appointmentSettings.requireConfirmation', checked)}
                        disabled={!isAdmin}
                      />
                      Require Confirmation
                    </Flex>
                  </Text>
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
                </Flex>
              </Card>
            </Tabs.Content>

            <Tabs.Content value="communication">
              <Card size="2" variant="surface">
                <Flex direction="column" gap="4" p="4">
                  <Heading size="5">Communication Settings</Heading>
                  <Text as="label" size="2">
                    <Flex gap="2">
                      <Switch
                        size="2"
                        checked={settings.communicationSettings.smsEnabled}
                        onCheckedChange={(checked) => updateSettings('communicationSettings.smsEnabled', checked)}
                        disabled={!isAdmin}
                      />
                      SMS Enabled
                    </Flex>
                  </Text>
                  <Text as="label" size="2">
                    <Flex gap="2">
                      <Switch
                        size="2"
                        checked={settings.communicationSettings.emailEnabled}
                        onCheckedChange={(checked) => updateSettings('communicationSettings.emailEnabled', checked)}
                        disabled={!isAdmin}
                      />
                      Email Enabled
                    </Flex>
                  </Text>
                  <Text as="label" size="2">
                    <Flex gap="2">
                      <Switch
                        size="2"
                        checked={settings.communicationSettings.appointmentReminders}
                        onCheckedChange={(checked) => updateSettings('communicationSettings.appointmentReminders', checked)}
                        disabled={!isAdmin}
                      />
                      Appointment Reminders
                    </Flex>
                  </Text>
                  <Text as="label" size="2">
                    <Flex gap="2">
                      <Switch
                        size="2"
                        checked={settings.communicationSettings.labResultNotifications}
                        onCheckedChange={(checked) => updateSettings('communicationSettings.labResultNotifications', checked)}
                        disabled={!isAdmin}
                      />
                      Lab Result Notifications
                    </Flex>
                  </Text>
                  <Text as="label" size="2">
                    <Flex gap="2">
                      <Switch
                        size="2"
                        checked={settings.communicationSettings.invoiceReminders}
                        onCheckedChange={(checked) => updateSettings('communicationSettings.invoiceReminders', checked)}
                        disabled={!isAdmin}
                      />
                      Invoice Reminders
                    </Flex>
                  </Text>
                </Flex>
              </Card>
            </Tabs.Content>

            <Tabs.Content value="billing">
              <Card size="2" variant="surface">
                <Flex direction="column" gap="4" p="4">
                  <Heading size="5">Billing Settings</Heading>
                  <LabeledTextField
                    label="Currency"
                    value={settings.billingSettings.currency || 'USD'}
                    onChange={(e) => updateSettings('billingSettings.currency', e.target.value)}
                    disabled={!isAdmin}
                    placeholder="USD"
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
                  <Text as="label" size="2">
                    <Flex gap="2">
                      <Switch
                        size="2"
                        checked={settings.billingSettings.allowPartialPayments}
                        onCheckedChange={(checked) => updateSettings('billingSettings.allowPartialPayments', checked)}
                        disabled={!isAdmin}
                      />
                      Allow Partial Payments
                    </Flex>
                  </Text>
                </Flex>
              </Card>
            </Tabs.Content>

            <Tabs.Content value="queue">
              <Card size="2" variant="surface">
                <Flex direction="column" gap="4" p="4">
                  <Heading size="5">Queue Settings</Heading>
                  <Text as="label" size="2">
                    <Flex gap="2">
                      <Switch
                        size="2"
                        checked={settings.queueSettings.enableQueue}
                        onCheckedChange={(checked) => updateSettings('queueSettings.enableQueue', checked)}
                        disabled={!isAdmin}
                      />
                      Enable Queue
                    </Flex>
                  </Text>
                  <Text as="label" size="2">
                    <Flex gap="2">
                      <Switch
                        size="2"
                        checked={settings.queueSettings.autoAssignRooms}
                        onCheckedChange={(checked) => updateSettings('queueSettings.autoAssignRooms', checked)}
                        disabled={!isAdmin}
                      />
                      Auto Assign Rooms
                    </Flex>
                  </Text>
                  <LabeledTextField
                    label="Estimated Wait Time (minutes)"
                    type="number"
                    value={settings.queueSettings.estimatedWaitTimeMinutes ?? 15}
                    onChange={(e) => updateSettings('queueSettings.estimatedWaitTimeMinutes', parseInt(e.target.value) || 15)}
                    disabled={!isAdmin}
                    placeholder="15"
                  />
                  <Text as="label" size="2">
                    <Flex gap="2">
                      <Switch
                        size="2"
                        checked={settings.queueSettings.displayQueuePublicly}
                        onCheckedChange={(checked) => updateSettings('queueSettings.displayQueuePublicly', checked)}
                        disabled={!isAdmin}
                      />
                      Display Queue Publicly
                    </Flex>
                  </Text>
                </Flex>
              </Card>
            </Tabs.Content>

            <Tabs.Content value="general">
              <Card size="2" variant="surface">
                <Flex direction="column" gap="4" p="4">
                  <Heading size="5">General Settings</Heading>
                  <LabeledTextField
                    label="Timezone"
                    value={settings.generalSettings.timezone || 'UTC'}
                    onChange={(e) => updateSettings('generalSettings.timezone', e.target.value)}
                    disabled={!isAdmin}
                    placeholder="UTC"
                  />
                  <Box>
                    <Text size="2" weight="medium" mb="1" as="div">Date Format</Text>
                    <Select.Root
                      size="2"
                      value={settings.generalSettings.dateFormat}
                      onValueChange={(value) => updateSettings('generalSettings.dateFormat', value)}
                      disabled={!isAdmin}
                    >
                      <Select.Trigger placeholder="Date Format" />
                      <Select.Content>
                        <Select.Item value="MM/DD/YYYY">MM/DD/YYYY</Select.Item>
                        <Select.Item value="DD/MM/YYYY">DD/MM/YYYY</Select.Item>
                        <Select.Item value="YYYY-MM-DD">YYYY-MM-DD</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  </Box>
                  <Box>
                    <Text size="2" weight="medium" mb="1" as="div">Time Format</Text>
                    <Select.Root
                      size="2"
                      value={settings.generalSettings.timeFormat}
                      onValueChange={(value) => updateSettings('generalSettings.timeFormat', value as '12h' | '24h')}
                      disabled={!isAdmin}
                    >
                      <Select.Trigger placeholder="Time Format" />
                      <Select.Content>
                        <Select.Item value="12h">12 Hour</Select.Item>
                        <Select.Item value="24h">24 Hour</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  </Box>
                  <LabeledTextField
                    label="Items Per Page"
                    type="number"
                    value={settings.generalSettings.itemsPerPage ?? 20}
                    onChange={(e) => updateSettings('generalSettings.itemsPerPage', parseInt(e.target.value) || 20)}
                    disabled={!isAdmin}
                    placeholder="20"
                  />
                  <Text as="label" size="2">
                    <Flex gap="2">
                      <Switch
                        size="2"
                        checked={settings.generalSettings.enableAuditLog}
                        onCheckedChange={(checked) => updateSettings('generalSettings.enableAuditLog', checked)}
                        disabled={!isAdmin}
                      />
                      Enable Audit Log
                    </Flex>
                  </Text>
                  <LabeledTextField
                    label="Session Timeout (minutes)"
                    type="number"
                    value={settings.generalSettings.sessionTimeoutMinutes ?? 480}
                    onChange={(e) => updateSettings('generalSettings.sessionTimeoutMinutes', parseInt(e.target.value) || 480)}
                    disabled={!isAdmin}
                    placeholder="480"
                  />
                </Flex>
              </Card>
            </Tabs.Content>

            <Tabs.Content value="display">
              <Card size="2" variant="surface">
                <Flex direction="column" gap="4" p="4">
                  <Heading size="5">Display Settings</Heading>
                  <Box>
                    <Text size="2" weight="medium" mb="1" as="div">Theme</Text>
                    <Select.Root
                      size="2"
                      value={settings.displaySettings.theme}
                      onValueChange={(value) => updateSettings('displaySettings.theme', value as 'light' | 'dark' | 'auto')}
                      disabled={!isAdmin}
                    >
                      <Select.Trigger placeholder="Theme" />
                      <Select.Content>
                        <Select.Item value="light">Light</Select.Item>
                        <Select.Item value="dark">Dark</Select.Item>
                        <Select.Item value="auto">Auto</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  </Box>
                  <Text as="label" size="2">
                    <Flex gap="2">
                      <Switch
                        size="2"
                        checked={settings.displaySettings.sidebarCollapsed}
                        onCheckedChange={(checked) => updateSettings('displaySettings.sidebarCollapsed', checked)}
                        disabled={!isAdmin}
                      />
                      Sidebar Collapsed by Default
                    </Flex>
                  </Text>
                  <Text as="label" size="2">
                    <Flex gap="2">
                      <Switch
                        size="2"
                        checked={settings.displaySettings.showNotifications}
                        onCheckedChange={(checked) => updateSettings('displaySettings.showNotifications', checked)}
                        disabled={!isAdmin}
                      />
                      Show Notifications
                    </Flex>
                  </Text>
                </Flex>
              </Card>
            </Tabs.Content>
          </Box>
        </Tabs.Root>
        </Flex>
      </Container>
    </Section>
  );
}
