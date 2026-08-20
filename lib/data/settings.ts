/**
 * Data-access layer for the Settings model.
 *
 * Settings is tenant-scoped directly (`tenantId` column) per
 * lib/prisma-tenant-extension.ts (DIRECTLY_SCOPED_MODELS) — one row per
 * tenant (`tenantId` is @unique on the Prisma model). Every function below
 * assumes an active tenant context has already been established by the
 * caller via runWithTenant(tenantId, fn) — or runAsSystem(fn) for the
 * legacy no-tenant / cross-tenant cases — BEFORE calling into this module.
 * Functions here do not open their own context.
 *
 * The Mongoose Settings document had a deeply nested shape
 * (generalSettings.timezone, billingSettings.currency, etc.) that
 * prisma/schema.prisma flattens into prefixed columns (generalTimezone,
 * billingCurrency, ...). getOrCreateSettings()/updateSettings() below
 * translate between the nested API-response shape callers still expect and
 * the flat Prisma columns.
 */
import prisma from '../prisma';
import type { Prisma, Settings as PrismaSettings } from '@prisma/client';
import { getDefaultSettings } from '../settings';

/**
 * Reconstruct the nested shape (businessHours aside — that's a real relation,
 * left as-is) the rest of the app expects from a flat Prisma Settings row.
 */
export function toNestedSettings(s: PrismaSettings) {
  return {
    id: s.id,
    tenantId: s.tenantId,
    clinicName: s.clinicName,
    clinicAddress: s.clinicAddress,
    clinicPhone: s.clinicPhone,
    clinicEmail: s.clinicEmail,
    clinicWebsite: s.clinicWebsite,
    taxId: s.taxId,
    licenseNumber: s.licenseNumber,
    ptr: s.ptr,
    appointmentSettings: {
      defaultDuration: s.apptDefaultDuration,
      reminderHoursBefore: s.apptReminderHoursBefore,
      allowOnlineBooking: s.apptAllowOnlineBooking,
      requireConfirmation: s.apptRequireConfirmation,
      maxAdvanceBookingDays: s.apptMaxAdvanceBookingDays,
      minAdvanceBookingHours: s.apptMinAdvanceBookingHours,
    },
    communicationSettings: {
      smsEnabled: s.commSmsEnabled,
      emailEnabled: s.commEmailEnabled,
      appointmentReminders: s.commAppointmentReminders,
      labResultNotifications: s.commLabResultNotifications,
      invoiceReminders: s.commInvoiceReminders,
    },
    billingSettings: {
      currency: s.billingCurrency,
      taxRate: s.billingTaxRate,
      paymentTerms: s.billingPaymentTerms,
      lateFeePercentage: s.billingLateFeePercentage,
      invoicePrefix: s.billingInvoicePrefix,
      allowPartialPayments: s.billingAllowPartialPayments,
    },
    queueSettings: {
      enableQueue: s.queueEnable,
      autoAssignRooms: s.queueAutoAssignRooms,
      estimatedWaitTimeMinutes: s.queueEstimatedWaitTimeMinutes,
      displayQueuePublicly: s.queueDisplayPublicly,
    },
    generalSettings: {
      timezone: s.generalTimezone,
      dateFormat: s.generalDateFormat,
      timeFormat: s.generalTimeFormat === 'h12' ? '12h' : '24h',
      itemsPerPage: s.generalItemsPerPage,
      enableAuditLog: s.generalEnableAuditLog,
      sessionTimeoutMinutes: s.generalSessionTimeoutMinutes,
    },
    integrationSettings: {
      cloudinaryEnabled: s.integrationCloudinaryEnabled,
      twilioEnabled: s.integrationTwilioEnabled,
      smtpEnabled: s.integrationSmtpEnabled,
    },
    displaySettings: {
      theme: s.displayTheme,
      sidebarCollapsed: s.displaySidebarCollapsed,
      showNotifications: s.displayShowNotifications,
    },
    prescriptionDigitalSignatureEnabled: s.prescriptionDigitalSignatureEnabled ?? true,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/** Flatten a nested settings-shaped partial body into Prisma column updates. */
function flattenSettingsInput(body: Record<string, any>): Prisma.SettingsUpdateInput {
  const data: Record<string, any> = {};

  if (body.clinicName !== undefined) data.clinicName = body.clinicName;
  if (body.clinicAddress !== undefined) data.clinicAddress = body.clinicAddress;
  if (body.clinicPhone !== undefined) data.clinicPhone = body.clinicPhone;
  if (body.clinicEmail !== undefined) data.clinicEmail = body.clinicEmail;
  if (body.clinicWebsite !== undefined) data.clinicWebsite = body.clinicWebsite;
  if (body.taxId !== undefined) data.taxId = body.taxId;
  if (body.licenseNumber !== undefined) data.licenseNumber = body.licenseNumber;
  if (body.ptr !== undefined) data.ptr = body.ptr;
  if (body.prescriptionDigitalSignatureEnabled !== undefined) {
    data.prescriptionDigitalSignatureEnabled = body.prescriptionDigitalSignatureEnabled;
  }

  const a = body.appointmentSettings;
  if (a) {
    if (a.defaultDuration !== undefined) data.apptDefaultDuration = a.defaultDuration;
    if (a.reminderHoursBefore !== undefined) data.apptReminderHoursBefore = a.reminderHoursBefore;
    if (a.allowOnlineBooking !== undefined) data.apptAllowOnlineBooking = a.allowOnlineBooking;
    if (a.requireConfirmation !== undefined) data.apptRequireConfirmation = a.requireConfirmation;
    if (a.maxAdvanceBookingDays !== undefined) data.apptMaxAdvanceBookingDays = a.maxAdvanceBookingDays;
    if (a.minAdvanceBookingHours !== undefined) data.apptMinAdvanceBookingHours = a.minAdvanceBookingHours;
  }

  const c = body.communicationSettings;
  if (c) {
    if (c.smsEnabled !== undefined) data.commSmsEnabled = c.smsEnabled;
    if (c.emailEnabled !== undefined) data.commEmailEnabled = c.emailEnabled;
    if (c.appointmentReminders !== undefined) data.commAppointmentReminders = c.appointmentReminders;
    if (c.labResultNotifications !== undefined) data.commLabResultNotifications = c.labResultNotifications;
    if (c.invoiceReminders !== undefined) data.commInvoiceReminders = c.invoiceReminders;
  }

  const b = body.billingSettings;
  if (b) {
    if (b.currency !== undefined) data.billingCurrency = b.currency;
    if (b.taxRate !== undefined) data.billingTaxRate = b.taxRate;
    if (b.paymentTerms !== undefined) data.billingPaymentTerms = b.paymentTerms;
    if (b.lateFeePercentage !== undefined) data.billingLateFeePercentage = b.lateFeePercentage;
    if (b.invoicePrefix !== undefined) data.billingInvoicePrefix = b.invoicePrefix;
    if (b.allowPartialPayments !== undefined) data.billingAllowPartialPayments = b.allowPartialPayments;
  }

  const q = body.queueSettings;
  if (q) {
    if (q.enableQueue !== undefined) data.queueEnable = q.enableQueue;
    if (q.autoAssignRooms !== undefined) data.queueAutoAssignRooms = q.autoAssignRooms;
    if (q.estimatedWaitTimeMinutes !== undefined) data.queueEstimatedWaitTimeMinutes = q.estimatedWaitTimeMinutes;
    if (q.displayQueuePublicly !== undefined) data.queueDisplayPublicly = q.displayQueuePublicly;
  }

  const g = body.generalSettings;
  if (g) {
    if (g.timezone !== undefined) data.generalTimezone = g.timezone;
    if (g.dateFormat !== undefined) data.generalDateFormat = g.dateFormat;
    if (g.timeFormat !== undefined) data.generalTimeFormat = g.timeFormat === '24h' ? 'h24' : 'h12';
    if (g.itemsPerPage !== undefined) data.generalItemsPerPage = g.itemsPerPage;
    if (g.enableAuditLog !== undefined) data.generalEnableAuditLog = g.enableAuditLog;
    if (g.sessionTimeoutMinutes !== undefined) data.generalSessionTimeoutMinutes = g.sessionTimeoutMinutes;
  }

  const i = body.integrationSettings;
  if (i) {
    if (i.cloudinaryEnabled !== undefined) data.integrationCloudinaryEnabled = i.cloudinaryEnabled;
    if (i.twilioEnabled !== undefined) data.integrationTwilioEnabled = i.twilioEnabled;
    if (i.smtpEnabled !== undefined) data.integrationSmtpEnabled = i.smtpEnabled;
  }

  const d = body.displaySettings;
  if (d) {
    if (d.theme !== undefined) data.displayTheme = d.theme;
    if (d.sidebarCollapsed !== undefined) data.displaySidebarCollapsed = d.sidebarCollapsed;
    if (d.showNotifications !== undefined) data.displayShowNotifications = d.showNotifications;
  }

  return data as Prisma.SettingsUpdateInput;
}

export function getSettingsByTenant(tenantId: string | null) {
  return prisma.settings.findFirst({ where: tenantId ? { tenantId } : {} });
}

/**
 * Automation on/off flags (the flattened `automationSettings` boolean
 * struct — see the schema comment above `autoInvoiceGeneration`). Used by
 * lib/automations/* modules that previously read
 * `settings.automationSettings?.autoX !== false` off the Mongoose document.
 * Falls back to all-true (matching the Prisma column defaults) if no
 * Settings row exists yet for the tenant, mirroring the old Mongoose
 * "missing means enabled" behavior.
 */
export async function getAutomationSettings(tenantId: string | null) {
  const settings = await getSettingsByTenant(tenantId);
  return {
    autoInvoiceGeneration: settings?.autoInvoiceGeneration ?? true,
    autoPaymentReminders: settings?.autoPaymentReminders ?? true,
    autoLowStockAlerts: settings?.autoLowStockAlerts ?? true,
    autoLabNotifications: settings?.autoLabNotifications ?? true,
    autoExpiryMonitoring: settings?.autoExpiryMonitoring ?? true,
    autoAppointmentConfirmation: settings?.autoAppointmentConfirmation ?? true,
    autoPrescriptionRefills: settings?.autoPrescriptionRefills ?? true,
    autoFollowupScheduling: settings?.autoFollowupScheduling ?? true,
    autoDailyReports: settings?.autoDailyReports ?? true,
    autoWelcomeMessages: settings?.autoWelcomeMessages ?? true,
    autoVisitSummaries: settings?.autoVisitSummaries ?? true,
    autoNoShowHandling: settings?.autoNoShowHandling ?? true,
    autoWaitlistManagement: settings?.autoWaitlistManagement ?? true,
    autoBirthdayGreetings: settings?.autoBirthdayGreetings ?? true,
    autoHealthReminders: settings?.autoHealthReminders ?? true,
    autoFeedbackCollection: settings?.autoFeedbackCollection ?? true,
    autoRecurringAppointments: settings?.autoRecurringAppointments ?? true,
    autoMedicationAdherence: settings?.autoMedicationAdherence ?? true,
    autoBroadcastMessaging: settings?.autoBroadcastMessaging ?? true,
    autoPeriodicReports: settings?.autoPeriodicReports ?? true,
    autoStaffPerformanceReports: settings?.autoStaffPerformanceReports ?? true,
    autoInsuranceVerification: settings?.autoInsuranceVerification ?? true,
    autoQueueOptimization: settings?.autoQueueOptimization ?? true,
    autoDataRetention: settings?.autoDataRetention ?? true,
    autoSmartAssignment: settings?.autoSmartAssignment ?? true,
    autoInventoryReordering: settings?.autoInventoryReordering ?? true,
    autoPrescriptionExpiryWarnings: settings?.autoPrescriptionExpiryWarnings ?? true,
    autoDocumentExpiryTracking: settings?.autoDocumentExpiryTracking ?? true,
    autoCancellationPolicies: settings?.autoCancellationPolicies ?? true,
  };
}

/**
 * Find-or-create replicating today's Mongoose behavior: if no Settings row
 * exists yet for the tenant (or for the legacy no-tenant case), create one
 * seeded from lib/settings.ts's getDefaultSettings() — the single source of
 * truth for default values — then return the nested shape.
 */
export async function getOrCreateSettings(tenantId: string | null) {
  let settings = await getSettingsByTenant(tenantId);

  if (!settings) {
    const defaults = flattenSettingsInput(getDefaultSettings());
    settings = await prisma.settings.create({
      data: {
        ...(defaults as Prisma.SettingsCreateInput),
        ...(tenantId ? { tenant: { connect: { id: tenantId } } } : {}),
      },
    });
  }

  return toNestedSettings(settings);
}

/**
 * Update (or create, if none exists yet) the tenant's Settings row from a
 * nested-shape partial body, mirroring the Mongoose route's
 * merge-with-defaults-then-save behavior.
 */
export async function updateSettings(tenantId: string | null, body: Record<string, any>) {
  const existing = await getSettingsByTenant(tenantId);
  const data = flattenSettingsInput(body);

  let settings: PrismaSettings;
  if (!existing) {
    const defaults = flattenSettingsInput(getDefaultSettings());
    settings = await prisma.settings.create({
      data: {
        ...(defaults as Prisma.SettingsCreateInput),
        ...(data as Prisma.SettingsCreateInput),
        ...(tenantId ? { tenant: { connect: { id: tenantId } } } : {}),
      },
    });
  } else {
    settings = await prisma.settings.update({ where: { id: existing.id }, data });
  }

  return toNestedSettings(settings);
}
