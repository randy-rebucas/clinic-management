import 'server-only';
import { Types } from 'mongoose';
import Notification from '@/models/Notification';

/** The rep's own notifications that haven't expired (the TTL monitor lags up to a minute). */
export function inboxFilter(user: Types.ObjectId, now: Date = new Date()): Record<string, unknown> {
  return { user, $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }] };
}

export function unreadCount(user: Types.ObjectId, now: Date = new Date()): Promise<number> {
  return Notification.countDocuments({ ...inboxFilter(user, now), read: false });
}

export interface InboxItem {
  id: string;
  kind: string;
  title: string;
  message: string;
  screen: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: Date;
}

/** A stored notification as the rep app shows it. Older records carry no kind/screen metadata. */
export function toInboxItem(n: any): InboxItem {
  const meta = n.metadata ?? {};
  const support = n.type === 'support';
  const kind = typeof meta.kind === 'string' ? meta.kind : support ? 'support' : 'system';
  const screen = typeof meta.screen === 'string' ? meta.screen : support ? 'support' : null;
  const entity = meta.id ?? (support ? meta.supportRequestId : undefined);
  return {
    id: String(n._id),
    kind,
    title: n.title,
    message: n.message,
    screen,
    entityId: entity ? String(entity) : null,
    read: !!n.read,
    createdAt: n.createdAt,
  };
}
