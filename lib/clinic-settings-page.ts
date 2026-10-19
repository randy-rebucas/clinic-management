import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Settings from '@/models/Settings';
import Tenant from '@/models/Tenant';
import AuditLog from '@/models/AuditLog';
import { getDefaultSettings, getSettings } from '@/lib/settings';
import { resolveTimezone } from '@/lib/tz';
import { isEmailConfigured } from '@/lib/email';
import { isSMSConfigured } from '@/lib/sms';
import { isCloudinaryConfigured } from '@/lib/cloudinary';
import { AUTOMATIONS } from '@/lib/clinic-automations';
import { birSettingsOf } from '@/lib/bir';
import { CURRENCIES, WEEKDAYS, type ClinicSettingsPageData, type DayHours } from '@/lib/clinic-settings';

const FALLBACK_ZONES = ['Asia/Manila', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Australia/Sydney', 'Europe/London', 'America/New_York', 'America/Los_Angeles'];

/** Every zone the server's Intl knows, so the select can't offer one the date helpers reject. */
function timezones(current: string) {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    zones = [];
  }
  if (!zones.length) zones = FALLBACK_ZONES;
  return zones.includes(current) ? zones : [current, ...zones];
}

/**
 * Everything /admin/settings edits, as the app reads it: the clinic's own Settings document
 * (created from defaults when missing) and the time zone from the clinic record, plus which
 * outside services this server has and the last settings change from the audit log.
 */
export async function loadClinicSettingsPage(tenantIdInput: string): Promise<ClinicSettingsPageData> {
  if (!Types.ObjectId.isValid(tenantIdInput)) throw new Error('No clinic on this session');
  const tenantId = new Types.ObjectId(tenantIdInput);
  await connectDB();
  await getSettings(tenantIdInput); // creates the document from defaults if this clinic has none

  const [doc, tenant, last] = await Promise.all([
    Settings.findOne({ tenantId }).lean<Record<string, any> | null>(),
    Tenant.findById(tenantId).select('settings.timezone subdomain').lean<{ settings?: { timezone?: string }; subdomain?: string } | null>(),
    AuditLog.findOne({ tenantId, resource: 'settings' }).sort({ timestamp: -1, createdAt: -1 }).populate('userId', 'name email').lean<any>(),
  ]);

  const defaults = getDefaultSettings();
  const s: Record<string, any> = { ...defaults, ...(doc ?? {}) };
  const zone = resolveTimezone(tenant?.settings?.timezone);
  const hours: DayHours[] = WEEKDAYS.map((day) => {
    const found = (s.businessHours as DayHours[] | undefined)?.find((h) => h.day === day);
    const base = found ?? defaults.businessHours.find((h) => h.day === day)!;
    return { day, open: base.open || '09:00', close: base.close || '17:00', closed: base.closed === true };
  });
  const currency = String(s.billingSettings?.currency || 'PHP').toUpperCase();
  const automationsStored = (s.automationSettings ?? {}) as Record<string, unknown>;

  return {
    form: {
      clinicName: s.clinicName || '',
      clinicAddress: s.clinicAddress || '',
      clinicPhone: s.clinicPhone || '',
      clinicEmail: s.clinicEmail || '',
      clinicWebsite: s.clinicWebsite || '',
      taxId: s.taxId || '',
      licenseNumber: s.licenseNumber || '',
      ptr: s.ptr || '',
      businessHours: hours,
      timezone: zone,
      defaultDuration: Number(s.appointmentSettings?.defaultDuration) || 30,
      appointmentReminders: s.communicationSettings?.appointmentReminders !== false,
      currency: CURRENCIES.some((c) => c.code === currency) ? currency : 'PHP',
      taxRate: Number(s.billingSettings?.taxRate) || 0,
      invoicePrefix: String(s.billingSettings?.invoicePrefix || 'INV').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 10) || 'INV',
      allowPartialPayments: s.billingSettings?.allowPartialPayments !== false,
      autoAssignRooms: s.queueSettings?.autoAssignRooms === true,
      displayQueuePublicly: s.queueSettings?.displayQueuePublicly === true,
      prescriptionPaperSize: s.prescriptionPaperSize === 'A5' ? 'A5' : 'A4',
      prescriptionDigitalSignatureEnabled: s.prescriptionDigitalSignatureEnabled !== false,
      sidebarCollapsed: s.displaySettings?.sidebarCollapsed === true,
      bir: birSettingsOf(s.birSettings),
      // Each switch shows what the automation will actually do: unset keys read as their default.
      automations: Object.fromEntries(
        AUTOMATIONS.map((a) => [a.key, typeof automationsStored[a.key] === 'boolean' ? (automationsStored[a.key] as boolean) : a.defaultOn])
      ),
    },
    version: doc?.updatedAt ? new Date(doc.updatedAt).toISOString() : '',
    timezones: timezones(zone),
    services: { email: isEmailConfigured(), sms: isSMSConfigured(), files: isCloudinaryConfigured() },
    displayPath: '/api/queue/display',
    now: new Date().toISOString(),
    lastChange: last
      ? {
          who: last.userId?.name || last.userEmail || 'Someone',
          at: new Date(last.timestamp ?? last.createdAt).toISOString(),
          what: String(last.description || '').replace(/^Changed clinic settings: /, ''),
        }
      : null,
  };
}
