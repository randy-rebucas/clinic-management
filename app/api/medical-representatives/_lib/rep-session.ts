import 'server-only';
import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { verifySession, type SessionPayload } from '@/app/lib/dal';

export type RepSession = {
  session: SessionPayload;
  userObjectId: Types.ObjectId;
  /** Ownership filter for rep-owned records (products, visits, support requests). */
  ownerFilter: Record<string, unknown>;
};

/**
 * Authenticate a medical-representative session. Reps are not tied to one clinic
 * (their session normally carries no tenantId), so every rep-owned record is scoped to
 * the rep's own user id, plus the tenant when the session has one.
 */
export async function requireRepSession(): Promise<RepSession | NextResponse> {
  const session = await verifySession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'medical-representative') {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  if (!Types.ObjectId.isValid(session.userId)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const userObjectId = new Types.ObjectId(session.userId);
  const ownerFilter: Record<string, unknown> = { userId: userObjectId };
  if (session.tenantId && Types.ObjectId.isValid(session.tenantId)) {
    ownerFilter.tenantId = new Types.ObjectId(session.tenantId);
  }
  return { session, userObjectId, ownerFilter };
}

export function isRepSessionError(value: RepSession | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
