import 'server-only';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { Types } from 'mongoose';
import { verifySession, verifySessionToken, type SessionPayload } from '@/app/lib/dal';
import { refuseAccess } from '@/app/lib/auth-helpers';

export type RepSession = {
  session: SessionPayload;
  userObjectId: Types.ObjectId;
  /** Ownership filter for rep-owned records (products, visits, support requests). */
  ownerFilter: Record<string, unknown>;
  /** True when the caller authenticated with `Authorization: Bearer` (the mobile app). */
  viaBearer: boolean;
};

async function bearerToken(): Promise<string | null> {
  try {
    const authHeader = (await headers()).get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return null;
    return authHeader.slice(7).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Authenticate a medical-representative session, from the mobile app's Bearer token or the
 * `session` cookie. Both are the same staff session JWT and are checked against the database
 * (active user, current sessionVersion). Reps are not tied to one clinic (their session
 * normally carries no tenantId), so every rep-owned record is scoped to the rep's own user id,
 * plus the tenant when the session has one.
 */
export async function requireRepSession(): Promise<RepSession | NextResponse> {
  const token = await bearerToken();
  const session = token ? await verifySessionToken(token) : await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'medical-representative') {
    return refuseAccess(session, 'Forbidden', 'medical-representative-api');
  }
  if (!Types.ObjectId.isValid(session.userId)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userObjectId = new Types.ObjectId(session.userId);
  const ownerFilter: Record<string, unknown> = { userId: userObjectId };
  if (session.tenantId && Types.ObjectId.isValid(session.tenantId)) {
    ownerFilter.tenantId = new Types.ObjectId(session.tenantId);
  }
  return { session, userObjectId, ownerFilter, viaBearer: token !== null };
}

export function isRepSessionError(value: RepSession | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

/** Filter for the rep's own MedicalRepresentative profile. */
export function repProfileFilter(rep: RepSession): Record<string, unknown> {
  const filter: Record<string, unknown> = { userId: rep.userObjectId };
  if (rep.ownerFilter.tenantId) filter.tenantIds = rep.ownerFilter.tenantId;
  return filter;
}

/** Fields never returned to the rep from their own MedicalRepresentative profile. */
export const REP_PRIVATE_FIELDS =
  '-internalNotes -paymentStatus -paymentDate -paymentAmount -paymentMethod -paymentReference -password';
