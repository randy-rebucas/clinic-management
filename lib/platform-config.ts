import 'server-only';
import connectDB from '@/lib/mongodb';
import PlatformSetting, { type PlatformSettingKey } from '@/models/PlatformSetting';
import Counter from '@/models/Counter';
import { decryptData, encryptData } from '@/lib/encryption';
import { DEFAULT_PRICING, type PlanPricing } from '@/lib/subscription-period';
import {
  billingIssuerSchema,
  feesSchema,
  pricingSchema,
  type BillingIssuer,
  type PaymongoStatus,
  type PlatformFees,
} from '@/lib/platform-config-schema';

/**
 * Platform → Configuration (models/PlatformSetting.ts): business settings platform admins manage
 * in the console instead of env vars. Every reader falls back to the env value or built-in
 * default until its section is first saved, so a deploy works before anyone opens the page.
 * Reads are cached for a short while; saving clears the cache on this instance.
 */

const CACHE_TTL_MS = 30 * 1000;
type Row = { data: Record<string, unknown>; secrets?: Record<string, string>; updatedAt?: Date; updatedBy?: string } | null;
const cache = new Map<PlatformSettingKey, { row: Row; expires: number }>();

async function readSection(key: PlatformSettingKey): Promise<Row> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.row;
  try {
    await connectDB();
    const row = await PlatformSetting.findOne({ key }).select('+secrets data updatedAt updatedBy').lean<Row>();
    cache.set(key, { row, expires: Date.now() + CACHE_TTL_MS });
    return row;
  } catch (error) {
    // No database (a build, an outage): the env values and defaults apply, uncached.
    console.error(`Platform configuration "${key}" could not be read; using fallbacks`, error);
    return null;
  }
}

export function forgetPlatformConfig(): void {
  cache.clear();
}

/** Save a section's plain values (replacing them) and, optionally, encrypted secrets (merged). */
export async function savePlatformSection(
  key: PlatformSettingKey,
  data: Record<string, unknown>,
  by: string,
  secrets?: { set?: Record<string, string>; unset?: string[] }
): Promise<void> {
  await connectDB();
  const update: Record<string, any> = { $set: { data, updatedBy: by } };
  for (const [name, value] of Object.entries(secrets?.set ?? {})) update.$set[`secrets.${name}`] = encryptData(value);
  if (secrets?.unset?.length) update.$unset = Object.fromEntries(secrets.unset.map((name) => [`secrets.${name}`, 1]));
  await PlatformSetting.updateOne({ key }, update, { upsert: true });
  forgetPlatformConfig();
}

/** When each section was last saved and by whom (null = still on env / defaults). */
export async function sectionMeta(key: PlatformSettingKey): Promise<{ updatedAt: string; updatedBy: string | null } | null> {
  const row = await readSection(key);
  return row?.updatedAt ? { updatedAt: new Date(row.updatedAt).toISOString(), updatedBy: row.updatedBy ?? null } : null;
}

// ── Plan prices ──────────────────────────────────────────────────────────────

/** The peso price list new checkouts are charged at. */
export async function getPlanPricing(): Promise<PlanPricing> {
  const parsed = pricingSchema.safeParse((await readSection('pricing'))?.data);
  return parsed.success ? parsed.data : DEFAULT_PRICING;
}

// ── Fees ─────────────────────────────────────────────────────────────────────

export const DEFAULT_FEES: PlatformFees = { medrepActivationFee: 0, voucherFaceValue: 80, voucherWholesalePrice: 60 };

export async function getPlatformFees(): Promise<PlatformFees> {
  const parsed = feesSchema.safeParse((await readSection('fees'))?.data);
  if (parsed.success) return parsed.data;
  const envFee = Number(process.env.MEDREP_ACTIVATION_FEE_PHP);
  return { ...DEFAULT_FEES, medrepActivationFee: Number.isFinite(envFee) && envFee >= 20 ? envFee : 0 };
}

// ── BIR issuer (DevCom Digital) ──────────────────────────────────────────────

/** The seller on subscription sales invoices, or null until it has been entered. */
export async function getBillingIssuer(): Promise<BillingIssuer | null> {
  const parsed = billingIssuerSchema.safeParse((await readSection('billing-issuer'))?.data);
  return parsed.success ? parsed.data : null;
}

/** Counter key for platform sales invoice serials under `prefix` (Counter rows with tenantId null). */
export const platformSerialKey = (prefix: string) => `platform-sales-invoice:${prefix.trim()}`;

/** The last serial issued under `prefix` (0 when none). */
export async function lastIssuedSerial(prefix: string): Promise<number> {
  await connectDB();
  const row = await Counter.findOne({ tenantId: null, key: platformSerialKey(prefix) }).select('seq').lean<{ seq: number } | null>();
  return row?.seq ?? 0;
}

// ── Platform PayMongo account ────────────────────────────────────────────────

/** The platform's PayMongo keys: the console's when saved, else the env's; null when neither. */
export async function getPlatformPaymongoKeys(): Promise<{ secretKey: string; webhookSecret: string | null } | null> {
  const secrets = (await readSection('paymongo'))?.secrets ?? {};
  let secretKey: string | null = null;
  let webhookSecret: string | null = null;
  try {
    secretKey = secrets.secretKey ? decryptData(secrets.secretKey) : null;
    webhookSecret = secrets.webhookSecret ? decryptData(secrets.webhookSecret) : null;
  } catch (error) {
    // A changed ENCRYPTION_KEY: the stored keys are unreadable, so fall back to env and say so.
    console.error('Platform PayMongo keys could not be decrypted; using env values', error);
  }
  secretKey = secretKey ?? process.env.PAYMONGO_SECRET_KEY ?? null;
  webhookSecret = webhookSecret ?? process.env.PAYMONGO_WEBHOOK_SECRET ?? null;
  return secretKey ? { secretKey, webhookSecret } : null;
}

export async function isPlatformPaymongoReady(): Promise<boolean> {
  return (await getPlatformPaymongoKeys()) !== null;
}

export async function getPaymongoStatus(): Promise<PaymongoStatus> {
  const stored = !!(await readSection('paymongo'))?.secrets?.secretKey;
  const keys = await getPlatformPaymongoKeys();
  if (!keys) return { configured: false, source: null, mode: null, secretLast4: null, webhookConfigured: false };
  return {
    configured: true,
    source: stored ? 'console' : 'env',
    mode: keys.secretKey.startsWith('sk_live_') ? 'live' : 'test',
    secretLast4: keys.secretKey.slice(-4),
    webhookConfigured: !!keys.webhookSecret,
  };
}

/** Which sections still run on env values or defaults, for the console's banner. */
export async function sectionsOnFallback(): Promise<string[]> {
  const out: string[] = [];
  if (!(await getBillingIssuer())) out.push('BIR issuer (subscription invoices are held until it is entered)');
  if ((await getPaymongoStatus()).source !== 'console') out.push('PayMongo account');
  if (!pricingSchema.safeParse((await readSection('pricing'))?.data).success) out.push('Plan prices');
  if (!feesSchema.safeParse((await readSection('fees'))?.data).success) out.push('Fees');
  return out;
}

