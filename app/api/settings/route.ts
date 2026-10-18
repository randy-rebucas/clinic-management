import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Settings from '@/models/Settings';
import Tenant from '@/models/Tenant';
import { isAdmin, forbiddenResponse } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import { resolveTimezone } from '@/lib/tz';
import { CURRENCY_CODES, INVOICE_PREFIX, WEEKDAYS, minutesOf } from '@/lib/clinic-settings';
import { clearSettingsCache, getDefaultSettings, getSettings } from '@/lib/settings';
import { isSMSConfigured } from '@/lib/sms';
import { isEmailConfigured } from '@/lib/email';
import { isCloudinaryConfigured } from '@/lib/cloudinary';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';

const zStr = (max = 200) => z.string().trim().max(max);
const zNum = (min: number, max: number) => z.coerce.number().finite().min(min).max(max);
const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');

// Only fields an admin may edit. tenantId, _id, timestamps and anything else in the body are stripped.
const settingsUpdateSchema = z.object({
  clinicName: zStr().min(1).optional(),
  clinicAddress: zStr(500).optional(),
  clinicPhone: zStr(50).optional(),
  clinicEmail: zStr(254).optional(),
  clinicWebsite: zStr(500).optional(),
  taxId: zStr(100).optional(),
  licenseNumber: zStr(100).optional(),
  ptr: zStr(100).optional(),
  businessHours: z
    .array(
      z
        .object({
          day: z.enum(WEEKDAYS),
          open: zTime,
          close: zTime,
          closed: z.boolean().optional(),
        })
        .refine((d) => d.closed || minutesOf(d.close) > minutesOf(d.open), { message: 'Closing time must be after opening time.', path: ['close'] })
    )
    .length(7)
    .refine((days) => new Set(days.map((d) => d.day)).size === 7, 'Each day of the week once.')
    .optional(),
  /** The clinic's time zone. Every clinic-day boundary reads it from the clinic record (Tenant). */
  timezone: z
    .string()
    .max(64)
    .refine((tz) => resolveTimezone(tz) === tz, 'Unknown time zone.')
    .optional(),
  /** Settings.updatedAt the change was made from; a newer save in between is refused. */
  version: z.string().max(40).optional(),
  appointmentSettings: z
    .object({
      defaultDuration: zNum(1, 1440),
      reminderHoursBefore: z.array(zNum(0, 720)).max(10),
      allowOnlineBooking: z.boolean(),
      requireConfirmation: z.boolean(),
      maxAdvanceBookingDays: zNum(0, 3650),
      minAdvanceBookingHours: zNum(0, 8760),
    })
    .partial()
    .optional(),
  communicationSettings: z
    .object({
      smsEnabled: z.boolean(),
      emailEnabled: z.boolean(),
      appointmentReminders: z.boolean(),
      labResultNotifications: z.boolean(),
      invoiceReminders: z.boolean(),
    })
    .partial()
    .optional(),
  billingSettings: z
    .object({
      currency: z.enum(CURRENCY_CODES),
      taxRate: zNum(0, 100),
      paymentTerms: zNum(0, 3650),
      lateFeePercentage: zNum(0, 100),
      invoicePrefix: z.string().trim().regex(INVOICE_PREFIX, 'Use up to 10 letters, numbers, - or _.'),
      allowPartialPayments: z.boolean(),
    })
    .partial()
    .optional(),
  queueSettings: z
    .object({
      enableQueue: z.boolean(),
      autoAssignRooms: z.boolean(),
      estimatedWaitTimeMinutes: zNum(0, 1440),
      displayQueuePublicly: z.boolean(),
    })
    .partial()
    .optional(),
  generalSettings: z
    .object({
      timezone: zStr(64),
      dateFormat: zStr(32),
      timeFormat: z.enum(['12h', '24h']),
      itemsPerPage: zNum(1, 500),
      enableAuditLog: z.boolean(),
      sessionTimeoutMinutes: zNum(5, 10080),
    })
    .partial()
    .optional(),
  integrationSettings: z
    .object({
      cloudinaryEnabled: z.boolean(),
      twilioEnabled: z.boolean(),
      smtpEnabled: z.boolean(),
    })
    .partial()
    .optional(),
  automationSettings: z.record(z.string().regex(/^auto[A-Za-z]{1,60}$/), z.boolean()).optional(),
  displaySettings: z
    .object({
      theme: z.enum(['light', 'dark', 'auto']),
      sidebarCollapsed: z.boolean(),
      showNotifications: z.boolean(),
    })
    .partial()
    .optional(),
  prescriptionDigitalSignatureEnabled: z.boolean().optional(),
  prescriptionPaperSize: z.enum(['A5', 'A4']).optional(),
});

/** Flatten nested plain objects to dot paths so a partial sub-object doesn't wipe its siblings. */
function toSetPaths(obj: Record<string, unknown>, prefix = '', out: Record<string, unknown> = {}) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      toSetPaths(value as Record<string, unknown>, path, out);
    } else {
      out[path] = value;
    }
  }
  return out;
}

// GET settings - accessible to all authenticated users of the clinic
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  try {
    await connectDB();

    let settings = await Settings.findOne(tenantFilter(ctx.tenantId));
    if (!settings) {
      settings = await Settings.create({ ...getDefaultSettings(), tenantId: ctx.tenantObjectId });
    }

    const settingsObj: Record<string, any> = {
      ...getDefaultSettings(),
      ...settings.toObject(),
    };
    if (typeof settingsObj.prescriptionDigitalSignatureEnabled === 'undefined') {
      settingsObj.prescriptionDigitalSignatureEnabled = true;
    }

    // The clinic's zone lives on the clinic record; the copy in generalSettings is only a mirror.
    const tenant = await Tenant.findById(ctx.tenantObjectId).select('settings.timezone').lean<{ settings?: { timezone?: string } } | null>();
    settingsObj.generalSettings = { ...settingsObj.generalSettings, timezone: resolveTimezone(tenant?.settings?.timezone) };

    settingsObj.integrationStatus = {
      twilio: isSMSConfigured(),
      smtp: isEmailConfigured(),
      cloudinary: isCloudinaryConfigured(),
    };

    return NextResponse.json(settingsObj, { status: 200 });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// PUT settings - only admins can update
export async function PUT(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  if (!isAdmin(ctx.session)) {
    return forbiddenResponse('Unauthorized: Only admins can update settings');
  }

  const parsed = await parseBody(request, settingsUpdateSchema);
  if (isValidationError(parsed)) return parsed;
  const { timezone, version, ...fields } = parsed.data;

  try {
    await connectDB();

    // Ensures the tenant's settings document exists (created from defaults if missing).
    await getSettings(ctx.tenantId);

    const before = await Settings.findOne(tenantFilter(ctx.tenantId)).lean<Record<string, any> | null>();
    if (!before) return NextResponse.json({ success: false, error: 'Settings not found' }, { status: 404 });
    if (version && before.updatedAt && new Date(before.updatedAt).toISOString() !== version) {
      return NextResponse.json(
        { success: false, error: 'Someone else saved the settings while you were editing. Reload to see their changes, then make yours again.' },
        { status: 409 }
      );
    }

    const $set = toSetPaths(fields as Record<string, unknown>);
    const tenant = timezone
      ? await Tenant.findById(ctx.tenantObjectId).select('settings.timezone').lean<{ settings?: { timezone?: string } } | null>()
      : null;
    const oldZone = resolveTimezone(tenant?.settings?.timezone);
    if (timezone) $set['generalSettings.timezone'] = timezone;

    // What actually changes, for the audit log.
    const read = (obj: any, path: string) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
    const norm = (v: unknown) => JSON.stringify(v ?? null, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== '_id')) : x));
    const changes = Object.entries($set)
      .filter(([path, value]) => path !== 'generalSettings.timezone' && norm(read(before, path)) !== norm(value))
      .map(([field, newValue]) => ({ field, oldValue: read(before, field) ?? null, newValue }));
    if (timezone && timezone !== oldZone) changes.push({ field: 'timezone', oldValue: oldZone, newValue: timezone });

    const settings = Object.keys($set).length
      ? await Settings.findOneAndUpdate(tenantFilter(ctx.tenantId), { $set }, { new: true, runValidators: true })
      : await Settings.findOne(tenantFilter(ctx.tenantId));

    if (!settings) {
      return NextResponse.json(
        { success: false, error: 'Settings not found' },
        { status: 404 }
      );
    }
    if (timezone && timezone !== oldZone) {
      await Tenant.updateOne({ _id: ctx.tenantObjectId }, { $set: { 'settings.timezone': timezone } });
    }

    clearSettingsCache(ctx.tenantId);

    if (changes.length) {
      await createAuditLog({
        userId: ctx.session.userId,
        userEmail: ctx.session.email,
        userRole: ctx.session.role,
        tenantId: ctx.tenantId,
        action: 'update',
        resource: 'settings',
        description: `Changed clinic settings: ${changes.map((c) => c.field).join(', ')}`,
        changes,
      });
    }

    return NextResponse.json({ success: true, data: { version: new Date(settings.updatedAt).toISOString(), changed: changes.length } }, { status: 200 });
  } catch (error: any) {
    console.error('Error updating settings:', error);
    if (error?.name === 'ValidationError' || error?.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid settings data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
