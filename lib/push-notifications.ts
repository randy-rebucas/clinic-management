import webpush from 'web-push';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import {
  listPushSubscriptionsForUser,
  listAllPushSubscriptions,
  deletePushSubscriptionsByEndpoints,
} from '@/lib/data/push-subscription';

function run<T>(tenantId: string | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

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
}

/**
 * Send a push notification to all subscriptions for a given user.
 * Silently removes expired/invalid subscriptions (410 Gone).
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  tenantId?: string
): Promise<void> {
  ensureVapidConfigured();
  if (!vapidConfigured) return;

  const subscriptions = await run(tenantId, () => listPushSubscriptionsForUser(userId));
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
    await run(tenantId, () => deletePushSubscriptionsByEndpoints(staleEndpoints));
  }
}

/**
 * Send a push notification to all subscriptions for a given tenant.
 */
export async function sendPushToTenant(
  tenantId: string,
  payload: PushPayload
): Promise<void> {
  ensureVapidConfigured();
  if (!vapidConfigured) return;

  const subscriptions = await runWithTenant(tenantId, () => listAllPushSubscriptions());
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
    await runWithTenant(tenantId, () => deletePushSubscriptionsByEndpoints(staleEndpoints));
  }
}
