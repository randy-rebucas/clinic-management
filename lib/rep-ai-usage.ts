import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import RepAiUsage from '@/models/RepAiUsage';
import { getPlatformFees, getPlanPricing } from '@/lib/platform-config';
import { hasActivePro, type RepPlan } from '@/lib/rep-billing';

/**
 * The rep AI assistant's monthly allowance. Every rep gets `repAiFreeActions` a month (a taste);
 * Pro gets `repAiProActions` (fair use). An action is one AI answer the rep asked for: a drafted
 * visit note, or a pre-visit brief made fresh (a saved brief reopened is free). Months run on
 * Manila time, the rep app's calendar.
 *
 * An action is reserved before the model is called and given back if the call fails, so a rep
 * never pays for an error and two taps at once can't both slip past the limit.
 */

export type RepAiFeature = 'visitNote' | 'visitBrief';

/** "YYYY-MM" in Asia/Manila (UTC+8, no daylight saving). */
export function manilaMonth(now = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/** The first day of the next Manila month, as "YYYY-MM-DD": when the allowance resets. */
export function nextMonthStart(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

export interface RepAiAllowance {
  plan: RepPlan;
  limit: number;
  used: number;
  remaining: number;
  /** When the count starts over ("YYYY-MM-DD", Manila). */
  resetsOn: string;
  /** Pro's monthly price; 0 when Pro isn't sold. */
  proMonthly: number;
  proYearly: number;
  proActions: number;
}

export async function repAiAllowance(
  userId: Types.ObjectId,
  profile: { subscription?: { plan?: string; expiresAt?: Date | string | null } },
  now = new Date()
): Promise<RepAiAllowance> {
  await connectDB();
  const month = manilaMonth(now);
  const [fees, pricing, row] = await Promise.all([
    getPlatformFees(),
    getPlanPricing(),
    RepAiUsage.findOne({ userId, month }).select('actions').lean<{ actions: number } | null>(),
  ]);
  const pro = hasActivePro(profile, now);
  const limit = pro ? fees.repAiProActions : fees.repAiFreeActions;
  const used = row?.actions ?? 0;
  return {
    plan: pro ? 'pro' : 'standard',
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetsOn: nextMonthStart(month),
    proMonthly: fees.medrepProMonthlyFee,
    proYearly: fees.medrepProMonthlyFee * pricing.yearlyMonths,
    proActions: fees.repAiProActions,
  };
}

const isDuplicateKey = (e: unknown) => (e as { code?: number })?.code === 11000;

/**
 * Take one action from this month's allowance. False when it's used up. The filter only matches
 * a row under the limit; when the row is at the limit the upsert collides with the unique
 * (userId, month) index, which means "no".
 */
export async function reserveAiAction(userId: Types.ObjectId, limit: number, feature: RepAiFeature, now = new Date()): Promise<boolean> {
  if (limit <= 0) return false;
  await connectDB();
  const month = manilaMonth(now);
  try {
    await RepAiUsage.updateOne(
      { userId, month, actions: { $lt: limit } },
      { $inc: { actions: 1, [`byFeature.${feature}`]: 1 } },
      { upsert: true }
    );
    return true;
  } catch (e) {
    if (isDuplicateKey(e)) return false;
    throw e;
  }
}

/** Give back a reserved action (the model call failed). */
export async function releaseAiAction(userId: Types.ObjectId, feature: RepAiFeature, now = new Date()): Promise<void> {
  await RepAiUsage.updateOne(
    { userId, month: manilaMonth(now), actions: { $gt: 0 } },
    { $inc: { actions: -1, [`byFeature.${feature}`]: -1 } }
  ).catch((e) => console.error('Rep AI: could not release an action', e));
}

/** Add the tokens a call used, for cost tracking. Never fails the request. */
export async function recordAiTokens(userId: Types.ObjectId, usage: { input: number; output: number }, now = new Date()): Promise<void> {
  await RepAiUsage.updateOne(
    { userId, month: manilaMonth(now) },
    { $inc: { inputTokens: usage.input, outputTokens: usage.output } }
  ).catch((e) => console.error('Rep AI: could not record tokens', e));
}
