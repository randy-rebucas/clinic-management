import 'server-only';
import type { PlanPricing } from '@/lib/subscription-period';
import type { BillingIssuer, PaymongoStatus, PlatformFees } from '@/lib/platform-config-schema';
import {
  getBillingIssuer,
  getPaymongoStatus,
  getPlanPricing,
  getPlatformFees,
  lastIssuedSerial,
  sectionMeta,
  sectionsOnFallback,
} from '@/lib/platform-config';

type Meta = { updatedAt: string; updatedBy: string | null } | null;

/** Everything the Platform → Configuration page shows. Plain JSON; never a secret. */
export interface PlatformConfigView {
  issuer: BillingIssuer | null;
  /** Serials used and left in the issuer's current range. */
  serials: { last: number; remaining: number } | null;
  paymongo: PaymongoStatus;
  /** Where PayMongo should send the platform account's events. */
  paymongoWebhookUrl: string;
  pricing: PlanPricing;
  fees: PlatformFees;
  updated: Record<'billing-issuer' | 'paymongo' | 'pricing' | 'fees', Meta>;
  fallbacks: string[];
}

export async function loadPlatformConfig(): Promise<PlatformConfigView> {
  const [issuer, paymongo, pricing, fees, fallbacks, mIssuer, mPaymongo, mPricing, mFees] = await Promise.all([
    getBillingIssuer(),
    getPaymongoStatus(),
    getPlanPricing(),
    getPlatformFees(),
    sectionsOnFallback(),
    sectionMeta('billing-issuer'),
    sectionMeta('paymongo'),
    sectionMeta('pricing'),
    sectionMeta('fees'),
  ]);
  let serials: PlatformConfigView['serials'] = null;
  if (issuer) {
    const last = await lastIssuedSerial(issuer.serialPrefix);
    const next = Math.max(last + 1, issuer.serialStart);
    serials = { last, remaining: Math.max(0, issuer.serialEnd - next + 1) };
  }
  const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  return {
    issuer,
    serials,
    paymongo,
    paymongoWebhookUrl: `${base}/api/paymongo/webhook`,
    pricing,
    fees,
    updated: { 'billing-issuer': mIssuer, paymongo: mPaymongo, pricing: mPricing, fees: mFees },
    fallbacks,
  };
}
