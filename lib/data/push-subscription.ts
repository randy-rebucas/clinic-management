/**
 * Data-access layer for PushSubscription. DIRECTLY_SCOPED_MODEL in
 * lib/prisma-tenant-extension.ts. Every function assumes the caller has
 * already established tenant context via runWithTenant/runAsSystem.
 *
 * Shape: Mongoose's `keys: { p256dh, auth }` embedded object is flattened to
 * keysP256dh/keysAuth columns.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export function toPushSubscriptionDTO(s: Prisma.PushSubscriptionGetPayload<{}>) {
  const { keysP256dh, keysAuth, userId, ...rest } = s;
  return {
    _id: s.id,
    ...rest,
    userId,
    keys: { p256dh: keysP256dh, auth: keysAuth },
  };
}

export interface UpsertPushSubscriptionInput {
  userId: string;
  endpoint: string;
  keysP256dh: string;
  keysAuth: string;
  userAgent?: string;
}

export async function upsertPushSubscription(input: UpsertPushSubscriptionInput) {
  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId: input.userId,
      endpoint: input.endpoint,
      keysP256dh: input.keysP256dh,
      keysAuth: input.keysAuth,
      userAgent: input.userAgent,
    },
    update: {
      userId: input.userId,
      keysP256dh: input.keysP256dh,
      keysAuth: input.keysAuth,
      userAgent: input.userAgent,
    },
  });
  return toPushSubscriptionDTO(sub);
}

export async function deletePushSubscriptionByEndpoint(endpoint: string) {
  return prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

export async function deletePushSubscriptionsByEndpoints(endpoints: string[]) {
  if (!endpoints.length) return { count: 0 };
  return prisma.pushSubscription.deleteMany({ where: { endpoint: { in: endpoints } } });
}

export async function listPushSubscriptionsForUser(userId: string) {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  return subs.map(toPushSubscriptionDTO);
}

/** All push subscriptions in the active tenant (tenant scoping applied by the extension). */
export async function listAllPushSubscriptions() {
  const subs = await prisma.pushSubscription.findMany({});
  return subs.map(toPushSubscriptionDTO);
}
