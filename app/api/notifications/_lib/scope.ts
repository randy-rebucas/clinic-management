import 'server-only';
import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { verifySession, type SessionPayload } from '@/app/lib/dal';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';

export type NotificationScope = {
  session: SessionPayload;
  /** Filter restricting notifications to the caller's own, in the caller's clinic. */
  ownFilter: Record<string, unknown>;
  tenantObjectId?: Types.ObjectId;
};

/** Not yet expired: no expiresAt, or one in the future. The TTL index deletes expired ones lazily. */
const notExpired = () => ({ expiresAt: { $not: { $lte: new Date() } } });

/**
 * Resolve the caller and the filter for their own notifications. Clinic users are scoped to
 * their tenant; medical representatives have no tenant, so they only see their own
 * tenant-less notifications. Expired notifications are excluded everywhere.
 */
export async function requireNotificationScope(): Promise<NotificationScope | NextResponse> {
  const session = await verifySession();
  if (session?.role === 'medical-representative' && !session.tenantId) {
    if (!Types.ObjectId.isValid(session.userId)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return {
      session,
      ownFilter: {
        user: new Types.ObjectId(session.userId),
        $or: [{ tenantId: { $exists: false } }, { tenantId: null }],
        ...notExpired(),
      },
    };
  }

  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  if (!Types.ObjectId.isValid(ctx.session.userId)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return {
    session: ctx.session,
    tenantObjectId: ctx.tenantObjectId,
    ownFilter: { user: new Types.ObjectId(ctx.session.userId), tenantId: ctx.tenantObjectId, ...notExpired() },
  };
}

export function isNotificationScopeError(value: NotificationScope | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
