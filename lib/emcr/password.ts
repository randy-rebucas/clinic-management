import 'server-only';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import EmcrAccount from '@/models/EmcrAccount';
import { dummyPasswordHash } from '@/app/api/patients/auth/shared';
import { forgetAccountCache, type EmcrAccountLean } from '@/lib/emcr/account';
import { ensureLoginId } from '@/lib/emcr/login-id';

/**
 * eMCR sign-in credential: the account's mobile number + a password. Patients have none until
 * one is made:
 * - by the holder, right after proving the phone (invite redeemed, or first SMS sign-in);
 * - by clinic staff, as a temporary password printed on the invite slip for a phone that can't
 *   get texts (`mustChangePassword`: the holder replaces it at first sign-in).
 * The SMS code stays the way to set the first password and to reset a forgotten one.
 */

export const MIN_PASSWORD_LENGTH = 8;
/** Lowercase without look-alikes: read off paper and typed on a phone keyboard. */
const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const TEMP_LENGTH = 10;

export function generateTempPassword(): string {
  let out = '';
  for (let i = 0; i < TEMP_LENGTH; i++) out += TEMP_ALPHABET[randomInt(0, TEMP_ALPHABET.length)];
  return out;
}

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 200) return 'That password is too long.';
  return null;
}

/**
 * Save the password, and give the account its structured login ID (lib/emcr/login-id.ts) if it has
 * none yet; `tenantId` is the clinic whose location code to prefer.
 */
export async function setAccountPassword(
  accountId: Types.ObjectId | string,
  password: string,
  by: 'user' | 'staff',
  tenantId?: Types.ObjectId | string
): Promise<void> {
  await connectDB();
  await EmcrAccount.updateOne(
    { _id: accountId },
    {
      $set: {
        password: await bcrypt.hash(password, 12),
        passwordSetAt: new Date(),
        passwordSetBy: by,
        mustChangePassword: by === 'staff',
      },
    }
  );
  forgetAccountCache();
  await ensureLoginId(accountId, tenantId);
}

/** Whether `password` is the account's. False when it has none. */
export async function accountPasswordMatches(accountId: Types.ObjectId | string, password: string): Promise<boolean> {
  await connectDB();
  const account = await EmcrAccount.findById(accountId).select('+password').lean<{ password?: string } | null>();
  if (!account?.password) {
    await bcrypt.compare(password, dummyPasswordHash());
    return false;
  }
  return bcrypt.compare(password, account.password);
}

/**
 * Mobile number or login ID + password sign-in. The same work is done whether or not the account
 * exists or has a password, so timing doesn't tell which numbers or IDs exist.
 */
export async function authenticateAccountPassword(
  login: { phone: string } | { loginId: string },
  password: string
): Promise<EmcrAccountLean | null> {
  await connectDB();
  const account = await EmcrAccount.findOne(login).select('+password').lean<(EmcrAccountLean & { password?: string }) | null>();
  if (!account?.password) {
    await bcrypt.compare(password, dummyPasswordHash());
    return null;
  }
  if (!(await bcrypt.compare(password, account.password))) return null;
  if (account.disabled) return null;
  const { password: _hash, ...rest } = account;
  void _hash;
  return rest;
}
