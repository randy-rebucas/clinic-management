import 'server-only';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import EmcrAccount from '@/models/EmcrAccount';
import Patient from '@/models/Patient';
import { dummyPasswordHash, revokeAllPatientAccess } from '@/app/api/patients/auth/shared';
import { personRecordIds } from '@/lib/patient-family';
import { findAccountForSession, forgetAccountCache, type EmcrAccountLean } from '@/lib/emcr/account';
import { ensureLoginId } from '@/lib/emcr/login-id';
import { revokeEmcrAccountSessions } from '@/app/lib/dal';

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
 *
 * A staff password is known to that clinic and nobody proved the phone, so it is tied to the clinic
 * (`passwordTenantId`). Replacing it keeps that tie unless `phoneProven`: knowing the temporary
 * password must not be enough to turn it into a sign-in that reaches every clinic.
 */
export async function setAccountPassword(
  accountId: Types.ObjectId | string,
  password: string,
  by: 'user' | 'staff',
  tenantId?: Types.ObjectId | string,
  options: { phoneProven?: boolean } = {}
): Promise<void> {
  if (by === 'staff' && !tenantId) throw new Error('A staff-set password needs its clinic');
  await connectDB();
  const previous = await EmcrAccount.findById(accountId).select('+password').lean<{ password?: string } | null>();
  await EmcrAccount.updateOne(
    { _id: accountId },
    {
      $set: {
        password: await bcrypt.hash(password, 12),
        passwordSetAt: new Date(),
        passwordSetBy: by,
        mustChangePassword: by === 'staff',
        ...(by === 'staff' ? { passwordTenantId: tenantId } : {}),
      },
      ...(by === 'user' && options.phoneProven ? { $unset: { passwordTenantId: 1 } } : {}),
    }
  );
  // Changing or resetting a password ends the account's guardian sessions everywhere (a caller on
  // one is given a fresh one by the password route). A first password has no password-started
  // sessions to end, and app builds before 1.1.3 don't ask for a fresh pair: a guardian creating
  // their first password there must not be signed out. The holder's own sessions are rotated by
  // the callers.
  if (previous?.password) await revokeEmcrAccountSessions(String(accountId));
  forgetAccountCache();
  await ensureLoginId(accountId, tenantId);
}

type CredentialSession = Parameters<typeof findAccountForSession>[0] & { tid?: string };

/**
 * One person can sign in three ways: the account's password (mobile number or login ID), and the
 * patient password on each clinic record (email). A change has to reach all of them, or the old
 * password keeps working somewhere.
 *
 * A clinic-scoped session that didn't prove the phone only ever reaches its own clinic: it may
 * replace only passwords tied to that clinic, the tie stays, and other clinics' sessions stay.
 */
function confinedToClinic(session: Pick<CredentialSession, 'tid'>, phoneProven: boolean): string | null {
  return session.tid && !phoneProven ? session.tid : null;
}

/** Replace the person's patient passwords, skipping `exceptId`. Records with none stay without. */
export async function replaceRecordPasswords(
  holderId: unknown,
  password: string,
  session: Pick<CredentialSession, 'tid'>,
  options: { phoneProven: boolean; exceptId?: string }
): Promise<void> {
  const clinic = confinedToClinic(session, options.phoneProven);
  const ids = (await personRecordIds(holderId)).filter((id) => String(id) !== options.exceptId);
  if (!ids.length) return;
  const hashed = await bcrypt.hash(password, 12);
  await Patient.updateMany(
    { _id: { $in: ids }, password: { $exists: true }, ...(clinic ? { passwordTenantId: new Types.ObjectId(clinic) } : {}) },
    options.phoneProven ? { $set: { password: hashed }, $unset: { passwordTenantId: 1 } } : { $set: { password: hashed } }
  );
}

/** End every session on the person's other records. The caller's own record is rotated separately. */
export async function signOutOtherRecords(
  patientId: string,
  session: Pick<CredentialSession, 'tid'>,
  options: { phoneProven: boolean }
): Promise<void> {
  if (confinedToClinic(session, options.phoneProven)) return;
  const ids = (await personRecordIds(patientId)).filter((id) => String(id) !== patientId);
  await Promise.all(ids.map((id) => revokeAllPatientAccess(String(id))));
}

/**
 * After a change to the session record's patient password: replace the account's password and the
 * person's other patient passwords, and sign out their other records. An account with no password
 * stays without one.
 */
export async function applyPatientPasswordChange(
  session: CredentialSession & { patientId: string },
  password: string,
  options: { phoneProven: boolean }
): Promise<void> {
  const clinic = confinedToClinic(session, options.phoneProven);
  const account = await findAccountForSession(session);
  if (account?.passwordSetAt && (!clinic || String(account.passwordTenantId ?? '') === clinic)) {
    await setAccountPassword(account._id, password, 'user', undefined, options);
  }
  await replaceRecordPasswords(session.patientId, password, session, { ...options, exceptId: session.patientId });
  await signOutOtherRecords(session.patientId, session, options);
}

/**
 * Cancel a password a clinic may know, once the holder has proven the phone. The account may now
 * reach more than that clinic, and whoever holds the old password must not come with it. The app
 * asks for a new password after this sign-in.
 */
export async function cancelClinicPassword(accountId: Types.ObjectId | string): Promise<void> {
  await connectDB();
  await EmcrAccount.updateOne(
    { _id: accountId },
    { $unset: { password: 1, passwordSetAt: 1, passwordSetBy: 1, mustChangePassword: 1, passwordTenantId: 1 } }
  );
  // Every guardian session of the account ends here, not only those started with the clinic's
  // password (a token doesn't record how it began). It happens once: the clinic password is gone
  // afterwards. The caller's new session is issued after this, with the new version.
  await revokeEmcrAccountSessions(String(accountId));
  forgetAccountCache();
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
