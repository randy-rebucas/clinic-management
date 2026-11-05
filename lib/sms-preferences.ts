import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import SmsPreference, { type ISmsPreference } from '@/models/SmsPreference';
import { forgetSmsState } from '@/lib/sms-policy';

type Change = {
  /** E.164. */
  phone: string;
  /** Null means every clinic. */
  tenantId: Types.ObjectId | string | null;
  optedOut?: boolean;
  promoOptIn?: boolean;
  source: ISmsPreference['source'];
};

export async function setSmsPreference({ phone, tenantId, optedOut, promoOptIn, source }: Change): Promise<void> {
  await connectDB();
  const set: Record<string, unknown> = { source };
  if (optedOut !== undefined) set.optedOut = optedOut;
  if (promoOptIn !== undefined) set.promoOptIn = promoOptIn;
  const tenant = tenantId ? new Types.ObjectId(String(tenantId)) : null;
  await SmsPreference.updateOne({ phoneE164: phone, tenantId: tenant }, { $set: set }, { upsert: true });
  // Other instances catch up within the policy's one-minute cache.
  forgetSmsState(tenant);
}

export async function getSmsPreference(phone: string, tenantId: Types.ObjectId | string | null) {
  await connectDB();
  const tenant = tenantId ? new Types.ObjectId(String(tenantId)) : null;
  const row = await SmsPreference.findOne({ phoneE164: phone, tenantId: tenant })
    .select('optedOut promoOptIn')
    .lean<{ optedOut?: boolean; promoOptIn?: boolean } | null>();
  return { optedOut: !!row?.optedOut, promoOptIn: !!row?.promoOptIn };
}
