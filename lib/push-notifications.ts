import webpush from 'web-push';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import connectDB from '@/lib/mongodb';
import PushSubscription from '@/models/PushSubscription';
import MobileDevice, { PushCategory } from '@/models/MobileDevice';
import NotificationPreference from '@/models/NotificationPreference';
import type { NotificationPriority } from '@/models/Notification';
import { shouldDeliverPush, type DeliveryPreferences } from '@/lib/notification-policy';
import { Types } from 'mongoose';

const expo = new Expo();

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;
  webpush.setVapidDetails('mailto:admin@myclinicsoftware.com', publicKey, privateKey);
  vapidConfigured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
  /** Mobile app only: routing hints delivered in the Expo message's `data`. */
  data?: Record<string, string>;
  /** Decides whether quiet hours or a pause hold the push. Defaults to normal. */
  priority?: NotificationPriority;
}

/**
 * Who among these users shouldn't be interrupted by this push right now. If preferences can't
 * be read, nobody is held: a failed lookup must not swallow a clinical alert.
 */
async function usersHoldingPush(userIds: string[], priority?: NotificationPriority): Promise<Set<string>> {
  if (priority === 'urgent' || !userIds.length) return new Set();
  try {
    const rows = await NotificationPreference.find({ userId: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
      .select('userId pausedUntil quietHours')
      .lean<(DeliveryPreferences & { userId: Types.ObjectId })[]>();
    const now = new Date();
    return new Set(rows.filter((row) => !shouldDeliverPush(row, priority, now)).map((row) => String(row.userId)));
  } catch (error) {
    console.error('[push] Could not read notification preferences; delivering anyway:', error);
    return new Set();
  }
}

/**
 * Send a push notification to all subscriptions for a given user, unless their quiet hours or
 * pause hold it. Silently removes expired/invalid subscriptions (410 Gone).
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  tenantId?: string
): Promise<void> {
  ensureVapidConfigured();
  if (!vapidConfigured) return;

  await connectDB();

  if ((await usersHoldingPush([userId], payload.priority)).has(userId)) return;

  const query: any = { userId: new Types.ObjectId(userId) };
  if (tenantId) query.tenantId = new Types.ObjectId(tenantId);

  const subscriptions = await PushSubscription.find(query).lean();
  if (!subscriptions.length) return;

  const staleEndpoints: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload)
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  if (staleEndpoints.length) {
    await PushSubscription.deleteMany({ endpoint: { $in: staleEndpoints } });
  }
}

/**
 * Send a push notification to a patient's registered mobile devices
 * (Expo push service, which abstracts FCM/APNs). This is the patient/mobile
 * counterpart to sendPushToUser, which only delivers browser web-push to
 * staff User records — patients don't have PushSubscription rows.
 *
 * Invalid/unregistered tokens (DeviceNotRegistered) are cleared so we stop
 * retrying them.
 *
 * A device signed in with a clinic-scoped session (MobileDevice.tenantId set) only receives
 * pushes about that clinic: pass `options.tenantId` (the record's clinic). Without it, only
 * unscoped devices are notified.
 *
 * Delivered to every device of the person (devices register under whichever of their linked
 * records they signed in with) and to their family managers' devices, whose copy names the
 * family member and carries `data.profileId` so the app opens that profile.
 */
export async function sendPushToPatientDevices(
  patientId: string,
  payload: PushPayload,
  options: { tenantId?: string | Types.ObjectId | null } = {}
): Promise<{ sent: boolean }> {
  const scopes: Record<string, unknown>[] = [{ tenantId: null }];
  if (options.tenantId) scopes.push({ tenantId: new Types.ObjectId(String(options.tenantId)) });

  const { personRecordIds, guardianRecordIds } = await import('@/lib/patient-family');
  const { accountManagerRecordIds } = await import('@/lib/emcr/account');
  const [ownIds, guardianIds, accountManagerIds] = await Promise.all([
    personRecordIds(patientId).catch(() => []),
    guardianRecordIds(patientId, options.tenantId).catch(() => []),
    accountManagerRecordIds(patientId, options.tenantId).catch(() => []),
  ]);
  const own = ownIds.length ? ownIds : [new Types.ObjectId(patientId)];
  const ownKeys = new Set(own.map(String));
  const managerMap = new Map([...guardianIds, ...accountManagerIds].map((id) => [String(id), id]));
  const managers = [...managerMap.values()].filter((id) => !ownKeys.has(String(id)));

  const self = await sendToMobileDevices({ patientId: { $in: own }, $or: scopes }, payload);
  if (!managers.length) return self;

  const Patient = (await import('@/models/Patient')).default;
  const member = await Patient.findById(patientId).select('firstName').lean<{ firstName?: string } | null>();
  const family = await sendToMobileDevices(
    { patientId: { $in: managers }, $or: scopes },
    {
      ...payload,
      title: member?.firstName ? `${member.firstName}: ${payload.title}` : payload.title,
      data: { ...payload.data, profileId: patientId },
    }
  );
  return { sent: self.sent || family.sent };
}

/**
 * Send a push notification to a staff user's registered mobile devices (today: medical
 * representatives signed in to the mobile app). Same Expo delivery as patients.
 *
 * `honorQuietHours` is opt-in: pass it only for a push with a copy in the person's feed. The
 * medical rep reminders are marked sent whether or not they go out and have no such copy, so
 * holding one would lose it.
 */
export async function sendPushToUserDevices(
  userId: string,
  payload: PushPayload,
  options: { honorQuietHours?: boolean } = {}
): Promise<{ sent: boolean }> {
  if (options.honorQuietHours) {
    await connectDB();
    if ((await usersHoldingPush([userId], payload.priority)).has(userId)) return { sent: false };
  }
  return sendToMobileDevices({ userId: new Types.ObjectId(userId) }, payload);
}

/**
 * The mutable category a push belongs to, from its tag (the same prefixes the app routes on).
 * Untagged or unknown pushes have no category and can't be muted per category.
 */
export function pushCategoryForTag(tag: string | undefined): PushCategory | null {
  if (!tag) return null;
  if (tag.startsWith('appointment-')) return 'appointments';
  if (tag.startsWith('lab-result-')) return 'labResults';
  if (tag.startsWith('queue-')) return 'queue';
  if (tag.startsWith('message-')) return 'messages';
  if (tag.startsWith('invoice-')) return 'billing';
  if (tag.startsWith('prescription-')) return 'prescriptions';
  if (tag.startsWith('followup-')) return 'followUps';
  return null;
}

async function sendToMobileDevices(
  owner: { patientId: { $in: Types.ObjectId[] }; $or?: Record<string, unknown>[] } | { userId: Types.ObjectId },
  payload: PushPayload
): Promise<{ sent: boolean }> {
  await connectDB();

  // Devices that muted this category on the Notification Settings screen are skipped.
  const category = pushCategoryForTag(payload.tag);
  const devices = await MobileDevice.find({
    ...owner,
    revokedAt: null,
    pushToken: { $ne: null },
    ...(category ? { [`pushPrefs.${category}`]: { $ne: false } } : {}),
  }).lean();

  const validDevices = devices.filter((d) => d.pushToken && Expo.isExpoPushToken(d.pushToken));
  if (!validDevices.length) return { sent: false };

  const messages: ExpoPushMessage[] = validDevices.map((d) => ({
    to: d.pushToken as string,
    title: payload.title,
    body: payload.body,
    data: { ...payload.data, ...(payload.url ? { url: payload.url } : {}), tag: payload.tag },
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const tickets: ExpoPushTicket[] = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch {
      // Network/transport failure for this chunk — skip, don't throw.
    }
  }

  const staleTokens: string[] = [];
  tickets.forEach((ticket, i) => {
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      staleTokens.push(messages[i].to as string);
    }
  });

  if (staleTokens.length) {
    await MobileDevice.updateMany(
      { pushToken: { $in: staleTokens } },
      { $set: { pushToken: null } }
    );
  }

  const sent = tickets.some((t) => t.status === 'ok');
  return { sent };
}

/**
 * Send a push notification to all subscriptions for a given tenant, leaving out anyone whose
 * quiet hours or pause hold it.
 */
export async function sendPushToTenant(
  tenantId: string,
  payload: PushPayload
): Promise<void> {
  ensureVapidConfigured();
  if (!vapidConfigured) return;

  await connectDB();

  const subscriptions = await PushSubscription.find({
    tenantId: new Types.ObjectId(tenantId),
  }).lean();

  if (!subscriptions.length) return;

  const held = await usersHoldingPush([...new Set(subscriptions.map((sub) => String(sub.userId)))], payload.priority);
  const staleEndpoints: string[] = [];

  await Promise.allSettled(
    subscriptions.filter((sub) => !held.has(String(sub.userId))).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload)
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  if (staleEndpoints.length) {
    await PushSubscription.deleteMany({ endpoint: { $in: staleEndpoints } });
  }
}
