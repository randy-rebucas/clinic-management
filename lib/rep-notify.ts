import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Notification, { type NotificationPriority, type NotificationType } from '@/models/Notification';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { sendPushToUserDevices } from '@/lib/push-notifications';

/**
 * Every event a medical rep is told about: stored in their in-app inbox (a Notification with no
 * clinic) and pushed to the rep app. The inbox is the fallback when push is off, blocked or
 * the phone is away, so the record is written even for a rep who switched push off.
 */

export const REP_NOTIFICATION_KINDS = ['visit', 'delivery', 'reminder', 'expiry', 'clinic', 'team', 'sponsorship', 'support'] as const;
export type RepNotificationKind = (typeof REP_NOTIFICATION_KINDS)[number];

/** How long a rep's inbox keeps a notification (the TTL index on expiresAt removes it). */
export const REP_NOTIFICATION_TTL_DAYS = 90;

export function repNotificationExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + REP_NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** The stored Notification.type for a kind (the rep app reads `metadata.kind`). */
export function notificationTypeForKind(kind: RepNotificationKind): NotificationType {
  switch (kind) {
    case 'visit':
      return 'visit';
    case 'reminder':
    case 'expiry':
      return 'reminder';
    case 'support':
      return 'support';
    default:
      return 'system';
  }
}

/** Metadata the rep app routes on: the kind, the screen to open and the entity there. */
export function repNotificationMetadata(n: { kind: RepNotificationKind; screen: string; id?: string }) {
  return { kind: n.kind, screen: n.screen, ...(n.id ? { id: n.id } : {}) };
}

export interface RepNotice {
  kind: RepNotificationKind;
  title: string;
  body: string;
  /** Rep app screen the notification opens. */
  screen: string;
  /** The entity on that screen (visit, product, sponsorship, support request...). */
  id?: string;
  /** Push tag (collapses repeats on the phone). */
  tag?: string;
  priority?: NotificationPriority;
}

export interface RepTarget {
  userId: unknown;
  /** The rep's push switch when the caller already has it; looked up when left out. */
  notificationsEnabled?: boolean | null;
}

export interface RepPushOptions {
  /** Let quiet hours / a pause hold the push (sendPushToUserDevices option). */
  honorQuietHours?: boolean;
  /** Push body when it should differ from the stored body (e.g. a shorter cut). */
  pushBody?: string;
}

/**
 * Push a stored notification to the rep's phone. The data carries the screen, the entity and the
 * notification id so the app can mark it read. Never throws.
 */
export async function pushRepNotice(
  userId: string,
  n: Omit<RepNotice, 'kind'>,
  notificationId: string | null,
  options: RepPushOptions = {}
): Promise<{ sent: boolean }> {
  try {
    const data: Record<string, string> = { screen: n.screen };
    if (n.id) data.id = n.id;
    if (notificationId) data.notificationId = notificationId;
    const payload = {
      title: n.title,
      body: options.pushBody ?? n.body,
      ...(n.tag ? { tag: n.tag } : {}),
      ...(n.priority ? { priority: n.priority } : {}),
      data,
    };
    return options.honorQuietHours
      ? await sendPushToUserDevices(userId, payload, { honorQuietHours: true })
      : await sendPushToUserDevices(userId, payload);
  } catch (error) {
    console.error('[rep-notify] push failed:', error);
    return { sent: false };
  }
}

/** Whether the rep left push on (true when the profile isn't found: the push helper decides). */
async function pushEnabled(target: RepTarget, userId: string): Promise<boolean> {
  if (typeof target.notificationsEnabled === 'boolean') return target.notificationsEnabled;
  const muted = await MedicalRepresentative.exists({ userId: new Types.ObjectId(userId), notificationsEnabled: false });
  return !muted;
}

/**
 * Store a notification in the rep's inbox and push it unless they switched push off.
 * Never throws: a failed write still pushes, a failed push still leaves the record.
 */
export async function notifyRep(
  target: RepTarget,
  n: RepNotice,
  options: RepPushOptions = {}
): Promise<{ notificationId: string | null; sent: boolean }> {
  const userId = target.userId ? String(target.userId) : '';
  if (!Types.ObjectId.isValid(userId)) return { notificationId: null, sent: false };

  let notificationId: string | null = null;
  try {
    await connectDB();
    const doc = await Notification.create({
      user: new Types.ObjectId(userId),
      type: notificationTypeForKind(n.kind),
      priority: n.priority ?? 'normal',
      title: n.title,
      message: n.body,
      read: false,
      sender: { kind: 'system' },
      metadata: repNotificationMetadata(n),
      expiresAt: repNotificationExpiry(),
    });
    notificationId = String(doc._id);
  } catch (error) {
    console.error('[rep-notify] storing the notification failed:', error);
  }

  try {
    if (!(await pushEnabled(target, userId))) return { notificationId, sent: false };
  } catch (error) {
    console.error('[rep-notify] push preference lookup failed:', error);
    return { notificationId, sent: false };
  }
  const { sent } = await pushRepNotice(userId, n, notificationId, options);
  return { notificationId, sent };
}
