import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import logger from '@/lib/logger';
import { getSettings } from '@/lib/settings';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { hasFeature, SUBSCRIPTION_PACKAGES, type SubscriptionPlan } from '@/lib/subscription-packages';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { clinicMonth } from '@/lib/tz';
import SmsPreference from '@/models/SmsPreference';
import SmsUsage from '@/models/SmsUsage';
import { smsOptOutUrl } from '@/lib/sms-opt-out-link';

/**
 * Whether a clinic may send a text, and the quota it spends. Sign-in codes never come through here.
 *
 * `SMS_POLICY_MODE=enforce` blocks. Anything else only logs what would have been blocked, so the
 * effect can be checked against real traffic first; usage is counted either way.
 */

export type SmsCategory = 'auth' | 'transactional' | 'promotional';

export type SmsBlockReason = 'inactive' | 'disabled' | 'no-plan-feature' | 'opted-out' | 'no-consent' | 'quota';

/** Won't change by retrying soon. `inactive` and `quota` can clear, so a claim stays retryable. */
const FINAL_REASONS = new Set<SmsBlockReason>(['disabled', 'no-plan-feature', 'opted-out', 'no-consent']);

export function isFinalBlock(reason: SmsBlockReason | undefined): boolean {
  return !!reason && FINAL_REASONS.has(reason);
}

/** Promotional texts stop here, so routine ones still have room before the month ends. */
const PROMOTIONAL_SHARE = 0.8;
const STATE_TTL_MS = 60 * 1000;

interface ClinicSmsState {
  at: number;
  active: boolean;
  enabled: boolean;
  smsFeature: boolean;
  limit: number;
  month: string;
  clinicName: string;
  optedOut: Set<string>;
  promoOptIn: Set<string>;
}

const stateCache = new Map<string, ClinicSmsState>();

/** Forget a clinic's cached state, after its preferences change here. */
export function forgetSmsState(tenantId?: string | Types.ObjectId | null) {
  if (tenantId) stateCache.delete(String(tenantId));
  else stateCache.clear();
}

/** One read set per clinic per minute, so an automation run costs reads per clinic, not per text. */
async function clinicState(tenantId: string): Promise<ClinicSmsState> {
  const cached = stateCache.get(tenantId);
  if (cached && Date.now() - cached.at < STATE_TTL_MS) return cached;

  await connectDB();
  const [subscription, settings, timezone, preferences] = await Promise.all([
    checkSubscriptionStatus(tenantId),
    getSettings(tenantId),
    getTenantTimezone(tenantId),
    SmsPreference.find({ $or: [{ tenantId: new Types.ObjectId(tenantId) }, { tenantId: null, optedOut: true }] })
      .select('phoneE164 optedOut promoOptIn')
      .lean<{ phoneE164: string; optedOut?: boolean; promoOptIn?: boolean }[]>(),
  ]);

  const plan = (subscription.plan || 'trial') as SubscriptionPlan;
  const state: ClinicSmsState = {
    at: Date.now(),
    active: subscription.isActive,
    enabled: settings?.communicationSettings?.smsEnabled !== false,
    smsFeature: hasFeature(plan, 'smsNotifications'),
    limit: (SUBSCRIPTION_PACKAGES[plan] ?? SUBSCRIPTION_PACKAGES.trial).maxSmsPerMonth,
    month: clinicMonth(timezone),
    clinicName: settings?.clinicName || '',
    optedOut: new Set(preferences.filter((p) => p.optedOut).map((p) => p.phoneE164)),
    promoOptIn: new Set(preferences.filter((p) => p.promoOptIn).map((p) => p.phoneE164)),
  };
  stateCache.set(tenantId, state);
  return state;
}

/** GSM-7 alphabet; anything else (₱, em dash, emoji) makes the whole text UCS-2. */
const GSM7 = /^[\n\r\x20-\x5F\x61-\x7E@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà€]*$/;
const GSM7_DOUBLE = /[\^{}\\[\]~|€]/g;

export function smsSegments(message: string): number {
  if (GSM7.test(message)) {
    const length = message.length + (message.match(GSM7_DOUBLE)?.length ?? 0);
    return length <= 160 ? 1 : Math.ceil(length / 153);
  }
  const length = [...message].length;
  return length <= 70 ? 1 : Math.ceil(length / 67);
}

/**
 * Spend `segments` of the month in one write. The filter fails once the clinic is over `limit`, the
 * upsert then collides with the unique index, and that collision is the "full" answer.
 */
async function reserveSmsQuota(tenantId: Types.ObjectId, month: string, segments: number, limit: number): Promise<boolean> {
  try {
    await SmsUsage.updateOne(
      { tenantId, month, segments: { $lte: limit - segments } },
      { $inc: { segments } },
      { upsert: true }
    );
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

export async function refundSmsQuota(tenantId: Types.ObjectId, month: string, segments: number): Promise<void> {
  await SmsUsage.updateOne({ tenantId, month }, { $inc: { segments: -segments } });
}

export type SmsDecision =
  | { allowed: true; message: string; reservation?: { tenantId: Types.ObjectId; month: string; segments: number } }
  | { allowed: false; reason: SmsBlockReason };

function firstBlock(state: ClinicSmsState, category: SmsCategory, phone: string): SmsBlockReason | null {
  if (!state.active) return 'inactive';
  if (!state.enabled) return 'disabled';
  if (!state.smsFeature) return 'no-plan-feature';
  if (state.optedOut.has(phone)) return 'opted-out';
  if (category === 'promotional' && !state.promoOptIn.has(phone)) return 'no-consent';
  return null;
}

/** The sender is shared by every clinic, so the text itself has to say who it's from. */
function withClinicName(message: string, clinicName: string): string {
  if (!clinicName || message.toLowerCase().includes(clinicName.toLowerCase())) return message;
  return `${clinicName}: ${message}`;
}

export async function decideSms(options: {
  tenantId: Types.ObjectId | string;
  category: SmsCategory;
  /** E.164. */
  phone: string;
  message: string;
  template: string;
}): Promise<SmsDecision> {
  const enforce = process.env.SMS_POLICY_MODE === 'enforce';
  const tenantId = String(options.tenantId);
  const state = await clinicState(tenantId);
  const optOut = options.category === 'promotional' ? smsOptOutUrl(options.phone, tenantId) : null;
  const named = withClinicName(options.message, state.clinicName);
  const message = optOut ? `${named}\nStop texts: ${optOut}` : named;

  const blocked = firstBlock(state, options.category, options.phone);
  if (blocked) {
    if (enforce) return { allowed: false, reason: blocked };
    logger.info('SMS policy would block', { tenantId, template: options.template, reason: blocked });
  }

  const tenantObjectId = new Types.ObjectId(tenantId);
  const segments = smsSegments(message);
  const limit = options.category === 'promotional' ? Math.floor(state.limit * PROMOTIONAL_SHARE) : state.limit;
  const reserved = await reserveSmsQuota(tenantObjectId, state.month, segments, limit);
  if (!reserved) {
    if (enforce) return { allowed: false, reason: 'quota' };
    logger.info('SMS policy would block', { tenantId, template: options.template, reason: 'quota' });
    await SmsUsage.updateOne({ tenantId: tenantObjectId, month: state.month }, { $inc: { segments } });
  }
  return { allowed: true, message, reservation: { tenantId: tenantObjectId, month: state.month, segments } };
}
