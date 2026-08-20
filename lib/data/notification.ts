/**
 * Data-access layer for Notification. Notification is a DIRECTLY_SCOPED_MODEL
 * in lib/prisma-tenant-extension.ts. Every function assumes the caller has
 * already established tenant context via runWithTenant/runAsSystem.
 *
 * Shape: Mongoose's `relatedEntity: { type, id }` embedded object is
 * flattened to relatedEntityType/relatedEntityId columns (informational only,
 * no FK — polymorphic across appointment/visit/prescription/lab_result/
 * invoice/patient). toNotificationDTO() reconstructs the nested shape.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export function toNotificationDTO(n: Prisma.NotificationGetPayload<{}>) {
  const { relatedEntityType, relatedEntityId, userId, ...rest } = n;
  return {
    _id: n.id,
    ...rest,
    user: userId,
    relatedEntity:
      relatedEntityType || relatedEntityId
        ? { type: relatedEntityType ?? undefined, id: relatedEntityId ?? undefined }
        : undefined,
  };
}

export interface CreateNotificationInput {
  userId: string;
  type: Prisma.NotificationCreateInput['type'];
  priority?: Prisma.NotificationCreateInput['priority'];
  title: string;
  message: string;
  relatedEntityType?: Prisma.NotificationCreateInput['relatedEntityType'];
  relatedEntityId?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
}

export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      priority: input.priority ?? 'normal',
      title: input.title,
      message: input.message,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      actionUrl: input.actionUrl,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      expiresAt: input.expiresAt,
    },
  });
  return toNotificationDTO(notification);
}

export interface ListNotificationsFilter {
  userId: string;
  read?: boolean;
  type?: string;
}

export function buildNotificationWhere(filter: ListNotificationsFilter): Prisma.NotificationWhereInput {
  const where: Prisma.NotificationWhereInput = { userId: filter.userId };
  if (filter.read !== undefined) where.read = filter.read;
  if (filter.type) where.type = filter.type as Prisma.EnumNotificationTypeFilter['equals'];
  return where;
}

export async function listNotifications(where: Prisma.NotificationWhereInput, take?: number) {
  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
  });
  return notifications.map(toNotificationDTO);
}

export async function countUnreadNotifications(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}

export async function getNotificationRaw(id: string) {
  return prisma.notification.findUnique({ where: { id } });
}

export async function updateNotification(id: string, data: Prisma.NotificationUpdateInput) {
  const notification = await prisma.notification.update({ where: { id }, data });
  return toNotificationDTO(notification);
}

export async function deleteNotification(id: string) {
  return prisma.notification.delete({ where: { id } });
}

export async function markAllNotificationsRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true, readAt: new Date() },
  });
  return result.count;
}
