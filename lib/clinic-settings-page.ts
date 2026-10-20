import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Settings from '@/models/Settings';
import Tenant from '@/models/Tenant';
import AuditLog from '@/models/AuditLog';
import Counter from '@/models/Counter';
import Invoice from '@/models/Invoice';
import { COUNTER_KEY, highestIssuedByPrefix } from '@/lib/bir-issue';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { hasFeature } from '@/lib/subscription-packages';
import { getDefaultSettings, getSettings } from '@/lib/settings';
import { resolveTimezone } from '@/lib/tz';
import { isEmailConfigured } from '@/lib/email';
import { isSMSConfigured } from '@/lib/sms';
import { isCloudinaryConfigured } from '@/lib/cloudinary';
import { AUTOMATIONS } from '@/lib/clinic-automations';
import { birSettingsOf } from '@/lib/bir';
import { philhealthSettingsOf } from '@/lib/philhealth';
import { CURRENCIES, WEEKDAYS, settingsAreasOf, type ClinicSettingsPageData, type DayHours } from '@/lib/clinic-settings';

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

  const [doc, tenant, last, teleconsult, counter, lastSerial] = await Promise.all([
    Settings.findOne({ tenantId }).lean<Record<string, any> | null>(),
    Tenant.findById(tenantId).select('settings.timezone subdomain').lean<{ settings?: { timezone?: string }; subdomain?: string } | null>(),
    AuditLog.findOne({ tenantId, resource: 'settings' }).sort({ timestamp: -1, createdAt: -1 }).populate('userId', 'name email').lean<any>(),
    // The plan's feature only: an ended plan is the subscription page's business, not this switch's.
    checkSubscriptionStatus(tenantId).then((s) => hasFeature(s.plan || 'trial', 'teleconsult'), () => true),
    Promise.all([
      Counter.find({ tenantId, key: new RegExp(`^${COUNTER_KEY}(:|$)`) }).select('key seq').lean<{ key: string; seq?: number }[]>(),
      highestIssuedByPrefix(tenantId),
    ]),
    Invoice.findOne({ tenantId, 'bir.serialNo': { $exists: true } })
      .sort({ 'bir.issuedAt': -1 })
      .select('bir.serialNo bir.issuedAt')
      .lean<{ bir?: { serialNo?: string; issuedAt?: Date } } | null>(),
  ]);
  // Per prefix, the number its next serial follows: its counter, or what was printed under it before it had one.
  const [counters, printed] = counter;
  const usedByPrefix: Record<string, number> = Object.fromEntries(printed);
  for (const c of counters) {
    const prefix = c.key === COUNTER_KEY ? '' : c.key.slice(COUNTER_KEY.length + 1);
    usedByPrefix[prefix] = Math.max(usedByPrefix[prefix] ?? 0, Number(c.seq) || 0);
  }
  const changedPaths: string[] = Array.isArray(last?.changes)
    ? last.changes.map((c: { field?: string }) => String(c.field ?? ''))
    : String(last?.description || '').replace(/^Changed clinic settings: /, '').split(', ');

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
      teleconsultBooking: s.appointmentSettings?.teleconsultBooking === true,
      currency: CURRENCIES.some((c) => c.code === currency) ? currency : 'PHP',
      taxRate: Number(s.billingSettings?.taxRate) || 0,
      invoicePrefix: String(s.billingSettings?.invoicePrefix || 'INV').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 10) || 'INV',
      allowPartialPayments: s.billingSettings?.allowPartialPayments !== false,
      autoAssignRooms: s.queueSettings?.autoAssignRooms === true,
      displayQueuePublicly: s.queueSettings?.displayQueuePublicly === true,
      patientSelfCheckIn: s.queueSettings?.patientSelfCheckIn === true,
      prescriptionPaperSize: s.prescriptionPaperSize === 'A5' ? 'A5' : 'A4',
      prescriptionDigitalSignatureEnabled: s.prescriptionDigitalSignatureEnabled !== false,
      sidebarCollapsed: s.displaySettings?.sidebarCollapsed === true,
      bir: birSettingsOf(s.birSettings),
      philhealth: philhealthSettingsOf(s.philhealthSettings),
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
    plan: { teleconsult },
    serials: {
      used: usedByPrefix,
      last: lastSerial?.bir?.serialNo
        ? { serialNo: lastSerial.bir.serialNo, at: new Date(lastSerial.bir.issuedAt ?? Date.now()).toISOString() }
        : null,
    },
    lastChange: last
      ? {
          who: last.userId?.name || last.userEmail || 'Someone',
          at: new Date(last.timestamp ?? last.createdAt).toISOString(),
          what: settingsAreasOf(changedPaths).join(', '),
        }
      : null,
  };
}
