import 'server-only';
import type { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import User from '@/models/User';
import { createAuditLog } from '@/lib/audit';
import type { TenantSession } from '@/lib/api/tenant-session';

/**
 * How staff chat reaches the audit log. Logged: a conversation started, a message edited, a
 * message deleted for everyone: what changes the record after the fact. Each message sent is
 * not (the message itself says who sent it and when), and no message text is ever copied:
 * chats can name patients, and the log and its archives shouldn't hold a second copy.
 */

/** The other member's name, for "with Maria Santos". */
export async function memberName(tenantObjectId: Types.ObjectId, userId: unknown): Promise<string> {
  const user = await User.findOne({ _id: userId, tenantId: tenantObjectId }).select('name').lean<{ name?: string } | null>();
  return user?.name?.trim() || 'a former staff member';
}

export async function logChatChange(
  ctx: TenantSession,
  request: NextRequest,
  entry: {
    action: 'create' | 'update' | 'delete';
    /** The message, or the conversation when one is started. */
    resourceId: unknown;
    description: string;
    metadata?: Record<string, unknown>;
  }
) {
  await createAuditLog({
    userId: ctx.session.userId,
    userEmail: ctx.session.email,
    userRole: ctx.session.role,
    tenantId: ctx.tenantId,
    action: entry.action,
    resource: 'message',
    resourceId: String(entry.resourceId),
    description: entry.description,
    metadata: entry.metadata,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
    requestMethod: request.method,
    requestPath: request.nextUrl.pathname,
  });
}
