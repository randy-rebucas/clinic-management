import 'server-only';
import { verify as totpVerify } from 'otplib';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { encryptData, decryptData, isEncrypted } from '@/lib/encryption';

const TOTP_PERIOD_SECONDS = 30;

/** Encrypt a TOTP secret for storage. */
export function sealTotpSecret(secret: string): string {
  return encryptData(secret);
}

/** Decrypt a stored TOTP secret; legacy rows stored the base32 secret in plaintext. */
export function openTotpSecret(stored: string): string {
  return isEncrypted(stored) ? decryptData(stored) : stored;
}

function normalizeCode(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const code = token.replace(/\s+/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}

type TotpUser = {
  totpSecret?: string;
  totpPendingSecret?: string;
  totpLastUsedStep?: number;
  totpEnabled?: boolean;
};

async function matchStep(secret: string, code: string, lastStep?: number): Promise<number | null> {
  const result = await totpVerify({
    token: code,
    secret,
    epochTolerance: TOTP_PERIOD_SECONDS,
    ...(typeof lastStep === 'number' ? { afterTimeStep: lastStep } : {}),
  });
  if (!result.valid) return null;
  return 'timeStep' in result && typeof result.timeStep === 'number'
    ? result.timeStep
    : Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);
}

/** Record the accepted time step atomically; fails if the same or a later step was already used. */
async function claimStep(userId: string, step: number): Promise<boolean> {
  const res = await User.updateOne(
    {
      _id: userId,
      $or: [
        { totpLastUsedStep: { $exists: false } },
        { totpLastUsedStep: null },
        { totpLastUsedStep: { $lt: step } },
      ],
    },
    { $set: { totpLastUsedStep: step } }
  );
  return res.modifiedCount === 1;
}

/**
 * Verify a code against the user's ACTIVE secret with replay protection: a time step
 * can be used only once. Legacy plaintext secrets are re-encrypted on first success.
 */
export async function verifyUserTotp(userId: string, token: unknown): Promise<boolean> {
  const code = normalizeCode(token);
  if (!code) return false;

  await connectDB();
  const user = await User.findById(userId)
    .select('+totpSecret +totpLastUsedStep totpEnabled')
    .lean<TotpUser | null>();
  if (!user?.totpSecret) return false;

  let secret: string;
  try {
    secret = openTotpSecret(user.totpSecret);
  } catch {
    return false;
  }

  const step = await matchStep(secret, code, user.totpLastUsedStep);
  if (step === null || !(await claimStep(userId, step))) return false;

  if (!isEncrypted(user.totpSecret)) {
    try {
      await User.updateOne({ _id: userId }, { $set: { totpSecret: sealTotpSecret(secret) } });
    } catch (error) {
      // A missing/invalid ENCRYPTION_KEY must not lock the user out; retry on next login
      console.error('[2fa] Could not encrypt legacy TOTP secret:', error instanceof Error ? error.message : error);
    }
  }
  return true;
}

/**
 * Verify a code against the PENDING (enrollment) secret and, on success, make it the
 * active secret and enable 2FA.
 */
export async function confirmPendingTotp(userId: string, token: unknown): Promise<boolean> {
  const code = normalizeCode(token);
  if (!code) return false;

  await connectDB();
  const user = await User.findById(userId)
    .select('+totpPendingSecret')
    .lean<TotpUser | null>();
  if (!user?.totpPendingSecret) return false;

  let secret: string;
  try {
    secret = openTotpSecret(user.totpPendingSecret);
  } catch {
    return false;
  }

  const step = await matchStep(secret, code);
  if (step === null) return false;

  const res = await User.updateOne(
    { _id: userId, totpPendingSecret: user.totpPendingSecret },
    {
      $set: { totpSecret: sealTotpSecret(secret), totpEnabled: true, totpLastUsedStep: step },
      $unset: { totpPendingSecret: '' },
    }
  );
  return res.modifiedCount === 1;
}
