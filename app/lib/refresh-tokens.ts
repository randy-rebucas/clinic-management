import 'server-only';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import RefreshToken from '@/models/RefreshToken';

/** Refresh tokens live 60 days; each use rotates to a fresh 60-day token. */
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60;

export type RefreshSubjectType = 'patient' | 'user';

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Issue a refresh token for a mobile sign-in. Pass `family` when rotating so reuse of any
 * earlier token in the chain can revoke the whole chain.
 */
export async function issueRefreshToken(
  subjectType: RefreshSubjectType,
  subjectId: string | Types.ObjectId,
  sessionVersion: number,
  family: string = randomUUID()
): Promise<string> {
  await connectDB();
  const token = randomBytes(32).toString('base64url');
  await RefreshToken.create({
    tokenHash: hashToken(token),
    family,
    subjectType,
    subjectId: new Types.ObjectId(String(subjectId)),
    sessionVersion,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  });
  return token;
}

export type ConsumedRefreshToken = {
  subjectId: string;
  sessionVersion: number;
  family: string;
};

export type ConsumeResult =
  | { ok: true; value: ConsumedRefreshToken }
  | { ok: false; code: 'REFRESH_INVALID' | 'REFRESH_REUSED' };

/**
 * Spend a refresh token (single use). A token that was already spent is a sign it was copied:
 * the whole family is revoked and the caller must sign in again. The caller still has to check
 * that the subject is active and that `sessionVersion` is current before issuing new tokens.
 */
export async function consumeRefreshToken(
  rawToken: unknown,
  subjectType: RefreshSubjectType
): Promise<ConsumeResult> {
  if (typeof rawToken !== 'string' || !TOKEN_FORMAT.test(rawToken)) {
    return { ok: false, code: 'REFRESH_INVALID' };
  }
  await connectDB();
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const row = await RefreshToken.findOneAndUpdate(
    { tokenHash, subjectType, usedAt: null, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true }
  ).lean<{ subjectId: Types.ObjectId; sessionVersion?: number; family: string } | null>();

  if (row) {
    return {
      ok: true,
      value: { subjectId: row.subjectId.toString(), sessionVersion: row.sessionVersion ?? 0, family: row.family },
    };
  }

  const spent = await RefreshToken.findOne({ tokenHash, subjectType, usedAt: { $ne: null } })
    .select('family')
    .lean<{ family: string } | null>();
  if (spent) {
    await revokeRefreshFamily(spent.family);
    return { ok: false, code: 'REFRESH_REUSED' };
  }
  return { ok: false, code: 'REFRESH_INVALID' };
}

export async function revokeRefreshFamily(family: string): Promise<void> {
  await connectDB();
  await RefreshToken.updateMany({ family, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

/**
 * Revoke one refresh token and its chain (sign-out on this device). Holding the token is the
 * proof, so this works even after the access token has expired.
 */
export async function revokeRefreshToken(
  rawToken: unknown,
  subjectType: RefreshSubjectType
): Promise<void> {
  if (typeof rawToken !== 'string' || !TOKEN_FORMAT.test(rawToken)) return;
  await connectDB();
  const row = await RefreshToken.findOne({ tokenHash: hashToken(rawToken), subjectType })
    .select('family')
    .lean<{ family: string } | null>();
  if (row) await revokeRefreshFamily(row.family);
}

/** Read `{ refreshToken }` from an optional JSON body (e.g. on DELETE). Never throws. */
export async function readRefreshTokenFromBody(request: Request): Promise<string | undefined> {
  try {
    const text = await request.text();
    if (!text) return undefined;
    const body = JSON.parse(text);
    return typeof body?.refreshToken === 'string' ? body.refreshToken : undefined;
  } catch {
    return undefined;
  }
}
