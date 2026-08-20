/**
 * Data-access layer for the Room model.
 *
 * Room is tenant-scoped directly (`tenantId` column) per
 * lib/prisma-tenant-extension.ts (DIRECTLY_SCOPED_MODELS). Every function
 * below assumes an active tenant context has already been established by
 * the caller via runWithTenant(tenantId, fn) — or runAsSystem(fn) for
 * cron/admin code that must legitimately cross tenants — BEFORE calling
 * into this module. Functions here do not open their own context.
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

export interface ListRoomsOptions {
  roomType?: string;
  status?: string;
  /** Shorthand for status: 'available', matching the Mongoose route's ?available=true param. */
  onlyAvailable?: boolean;
}

export function listRooms(opts: ListRoomsOptions = {}) {
  const { roomType, status, onlyAvailable } = opts;

  const where: Prisma.RoomWhereInput = {};
  if (roomType) where.roomType = roomType as Prisma.RoomWhereInput['roomType'];
  if (status) where.status = status as Prisma.RoomWhereInput['status'];
  if (onlyAvailable) where.status = 'available';

  return prisma.room.findMany({ where, orderBy: { name: 'asc' } });
}

export function getRoomById(id: string) {
  return prisma.room.findUnique({ where: { id } });
}

export function createRoom(data: Prisma.RoomCreateInput) {
  return prisma.room.create({ data });
}

export function updateRoom(id: string, data: Prisma.RoomUpdateInput) {
  return prisma.room.update({ where: { id }, data });
}

export function deleteRoom(id: string) {
  return prisma.room.delete({ where: { id } });
}
