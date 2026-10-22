import 'server-only';
import { randomBytes } from 'crypto';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import PaymentAccount, { isOnlineProvider, type IPaymentAccount } from '@/models/PaymentAccount';
import Doctor from '@/models/Doctor';
import { decryptData, encryptData } from '@/lib/encryption';
import { isAdmin } from '@/app/lib/auth-helpers';
import { myDoctorProfileId } from '@/lib/doctor-access';
import { adapterFor } from './registry';
import type { GatewayCredentials } from './types';
import type { AccountInput, PaymentAccountView } from './account-schema';

/**
 * Clinics' and doctors' own payment accounts (models/PaymentAccount.ts): who may manage them,
 * the view sent to browsers (never a secret), and which account an invoice is paid into.
 */

export const newWebhookToken = () => randomBytes(24).toString('base64url');

function appBase(): string {
  return (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function webhookUrlFor(acct: Pick<IPaymentAccount, 'provider' | 'webhookToken'>): string {
  return `${appBase()}/api/payments/webhook/${acct.provider}/${acct.webhookToken}`;
}

export function toPublic(acct: any, doctorNames?: Map<string, string>): PaymentAccountView {
  const online = isOnlineProvider(acct.provider);
  const doctorId = acct.doctorId ? String(acct.doctorId) : null;
  return {
    id: String(acct._id),
    ownerType: acct.ownerType,
    doctorId,
    doctorName: doctorId ? doctorNames?.get(doctorId) ?? null : null,
    provider: acct.provider,
    label: acct.label,
    isDefault: !!acct.isDefault,
    enabled: acct.enabled !== false,
    online,
    secretLast4: online ? acct.secretLast4 ?? null : null,
    webhookSecretSet: online ? !!acct.webhookSecretSet : false,
    publicKey: acct.publicKey ?? null,
    mode: acct.mode ?? null,
    webhookUrl: online ? webhookUrlFor(acct) : null,
    manual: online
      ? null
      : {
          accountName: acct.manual?.accountName ?? '',
          number: acct.manual?.number ?? '',
          bankName: acct.manual?.bankName ?? '',
          instructions: acct.manual?.instructions ?? '',
          hasQr: !!acct.manual?.hasQr,
        },
    verifiedAt: acct.verifiedAt ? new Date(acct.verifiedAt).toISOString() : null,
    lastWebhookAt: acct.lastWebhookAt ? new Date(acct.lastWebhookAt).toISOString() : null,
  };
}

/** A loaded account document (with its secret fields selected) as browsers see it. */
export function accountView(acct: IPaymentAccount): PaymentAccountView {
  const o = acct.toObject();
  return toPublic({ ...o, webhookSecretSet: !!o.webhookSecretEnc, manual: o.manual ? { ...o.manual, hasQr: !!o.manual.qrImage } : undefined });
}

/** Accounts of a clinic, as browsers see them. `doctorId` narrows to one doctor's. */
export async function listAccounts(tenantId: string, opts: { doctorId?: string | null; ownerType?: 'clinic' | 'doctor' } = {}): Promise<PaymentAccountView[]> {
  await connectDB();
  const filter: Record<string, unknown> = { tenantId: new Types.ObjectId(tenantId) };
  if (opts.ownerType) filter.ownerType = opts.ownerType;
  if (opts.doctorId) filter.doctorId = new Types.ObjectId(opts.doctorId);
  const rows = await PaymentAccount.find(filter)
    .select('+webhookSecretEnc +manual.qrImage')
    .sort({ ownerType: 1, isDefault: -1, createdAt: 1 })
    .lean<any[]>();
  const doctorIds = [...new Set(rows.map((r) => r.doctorId).filter(Boolean).map(String))];
  const doctors = doctorIds.length
    ? await Doctor.find({ _id: { $in: doctorIds.map((d) => new Types.ObjectId(d)) }, tenantId: new Types.ObjectId(tenantId) })
        .select('firstName lastName title')
        .lean<any[]>()
    : [];
  const names = new Map(doctors.map((d) => [String(d._id), [d.title, d.firstName, d.lastName].filter(Boolean).join(' ')]));
  return rows.map((r) =>
    toPublic({ ...r, webhookSecretSet: !!r.webhookSecretEnc, manual: r.manual ? { ...r.manual, hasQr: !!r.manual.qrImage } : r.manual }, names)
  );
}

export type ManageScope = { ok: true; doctorId: string | null } | { ok: false; status: number; error: string };

/**
 * May this staff member manage accounts of `ownerType` (for `doctorId`)? Clinic accounts: clinic
 * admins. A doctor's account: that doctor, or a clinic admin.
 */
export async function canManage(
  session: { role?: string; userId: string },
  tenantId: string,
  ownerType: 'clinic' | 'doctor',
  doctorId?: string | null
): Promise<ManageScope> {
  if (ownerType === 'clinic') {
    return isAdmin(session) ? { ok: true, doctorId: null } : { ok: false, status: 403, error: 'Only clinic admins manage the clinic’s payment accounts.' };
  }
  const mine = await myDoctorProfileId(tenantId, session.userId);
  const target = doctorId || mine;
  if (!target || !Types.ObjectId.isValid(target)) return { ok: false, status: 400, error: 'Choose the doctor this account belongs to.' };
  if (!isAdmin(session) && target !== mine) return { ok: false, status: 403, error: 'You can only manage your own payment account.' };
  const exists = await Doctor.exists({ _id: new Types.ObjectId(target), tenantId: new Types.ObjectId(tenantId) });
  return exists ? { ok: true, doctorId: target } : { ok: false, status: 404, error: 'Doctor not found' };
}

/** The account with its decrypted credentials, for a server-side call to its provider. */
export async function loadCredentials(acct: Pick<IPaymentAccount, 'secretKeyEnc' | 'webhookSecretEnc' | 'publicKey'>): Promise<GatewayCredentials | null> {
  if (!acct.secretKeyEnc) return null;
  try {
    return {
      secretKey: decryptData(acct.secretKeyEnc),
      webhookSecret: acct.webhookSecretEnc ? decryptData(acct.webhookSecretEnc) : undefined,
      publicKey: acct.publicKey,
    };
  } catch (error) {
    console.error(`Payment account ${(acct as any)._id}: keys could not be decrypted`, error);
    return null;
  }
}

/**
 * Apply a form's values to an account: secrets are encrypted and checked with the provider
 * first; a blank secret keeps the stored one. Returns an error message to show, or null.
 */
export async function applyAccountInput(acct: IPaymentAccount, input: AccountInput, isNew: boolean): Promise<string | null> {
  acct.label = input.label;
  if (input.enabled !== undefined) acct.enabled = input.enabled;
  if (isOnlineProvider(acct.provider)) {
    const adapter = adapterFor(acct.provider);
    if (!adapter) return 'This provider can’t be connected yet.';
    if (input.publicKey !== undefined) acct.publicKey = input.publicKey || undefined;
    if (input.secretKey) {
      const test = await adapter.testConnection({ secretKey: input.secretKey, publicKey: acct.publicKey });
      if (!test.ok) return test.error;
      acct.secretKeyEnc = encryptData(input.secretKey);
      acct.secretLast4 = input.secretKey.slice(-4);
      acct.mode = test.mode;
      acct.verifiedAt = new Date();
    } else if (isNew) {
      return 'Enter the secret key.';
    }
    if (input.webhookSecret) acct.webhookSecretEnc = encryptData(input.webhookSecret);
  } else {
    const m = input.manual ?? {};
    if (acct.provider === 'bank_transfer' && !(m.bankName && m.number)) return 'Enter the bank and the account number.';
    if (acct.provider === 'manual_qr' && !(m.qrImage || m.number || (!isNew && acct.manual?.qrImage))) return 'Upload the QR code or enter the GCash / Maya number.';
    acct.manual = {
      accountName: m.accountName,
      number: m.number,
      bankName: m.bankName,
      instructions: m.instructions,
      // Blank keeps the stored QR; '' from the form's "remove" clears it.
      qrImage: m.qrImage === undefined ? acct.manual?.qrImage : m.qrImage || undefined,
    };
  }
  return null;
}

/** Make `acct` its owner's default (clearing the old one first: one default per owner). */
export async function setDefault(acct: IPaymentAccount): Promise<void> {
  await PaymentAccount.updateMany(
    { tenantId: acct.tenantId, ownerType: acct.ownerType, doctorId: acct.doctorId ?? { $exists: false }, _id: { $ne: acct._id } },
    { $set: { isDefault: false } }
  );
  acct.isDefault = true;
}

export interface InvoicePayOptions {
  /** Accounts the patient may pay this invoice into, the default first. */
  accounts: IPaymentAccount[];
  defaultId: string | null;
}

/**
 * Where an invoice can be paid: a doctor's own enabled accounts when the invoice bills that
 * doctor's professional fee (their default first), then the clinic's. The platform's account
 * is never among them.
 */
export async function invoicePayOptions(tenantId: string | Types.ObjectId, invoice: { professionalFeeDoctor?: unknown }): Promise<InvoicePayOptions> {
  await connectDB();
  const tid = new Types.ObjectId(String(tenantId));
  const doctorId = invoice.professionalFeeDoctor ? String((invoice.professionalFeeDoctor as any)?._id ?? invoice.professionalFeeDoctor) : null;
  const or: Record<string, unknown>[] = [{ ownerType: 'clinic' }];
  if (doctorId && Types.ObjectId.isValid(doctorId)) or.push({ ownerType: 'doctor', doctorId: new Types.ObjectId(doctorId) });
  const rows = await PaymentAccount.find({ tenantId: tid, enabled: true, $or: or }).select('+secretKeyEnc +webhookSecretEnc +manual.qrImage');
  const usable = rows.filter((a) => !isOnlineProvider(a.provider) || (a.secretKeyEnc && adapterFor(a.provider)));
  const rank = (a: IPaymentAccount) => (a.ownerType === 'doctor' ? 0 : 2) + (a.isDefault ? 0 : 1);
  usable.sort((a, b) => rank(a) - rank(b));
  return { accounts: usable, defaultId: usable[0] ? String(usable[0]._id) : null };
}
