/**
 * Data-access layer for InventoryItem. InventoryItem is a
 * DIRECTLY_SCOPED_MODEL in lib/prisma-tenant-extension.ts. Every function
 * assumes the caller has already established tenant context via
 * runWithTenant/runAsSystem.
 *
 * InventoryStatus (in_stock/low_stock/out_of_stock) uses Prisma @map() to
 * keep hyphenated DB values ('in-stock', 'low-stock', 'out-of-stock') for
 * Mongoose-era compatibility; the JS/client enum members are underscored.
 * toDbEnum/fromDbEnum convert at the boundary, mirroring lib/data/queue.ts.
 *
 * computeInventoryStatus() replicates the Mongoose pre-save hook that derived
 * status from quantity/reorderLevel/expiryDate — Postgres has no hook
 * equivalent, so every write recomputes it here.
 *
 * NOTE: the Mongoose post-save hook that fired lib/automations/inventory-alerts
 * (low-stock/out-of-stock/expired alerts) is NOT reproduced — automations
 * remain out of scope for this migration batch (see lib/automations/*).
 */
import prisma from '../prisma';
import type { Prisma } from '@prisma/client';

const toDbEnum = (v: string | undefined) => (v ? v.replace(/-/g, '_') : v);
const fromDbEnum = (v: string | undefined | null) => (v ? v.replace(/_/g, '-') : v);

export function computeInventoryStatus(quantity: number, reorderLevel: number, expiryDate?: Date | null): string {
  const now = new Date();
  if (expiryDate && expiryDate < now) return 'expired';
  if (quantity === 0) return 'out_of_stock';
  if (quantity <= reorderLevel) return 'low_stock';
  return 'in_stock';
}

const fullInclude = {
  medicine: { select: { id: true, name: true, genericName: true } },
  lastRestockedBy: { select: { id: true, name: true } },
} satisfies Prisma.InventoryItemInclude;

export type InventoryItemWithRelations = Prisma.InventoryItemGetPayload<{ include: typeof fullInclude }>;

export function toInventoryItemDTO(item: InventoryItemWithRelations) {
  const { medicineId, lastRestockedById, ...rest } = item;
  return {
    _id: item.id,
    ...rest,
    status: fromDbEnum(item.status) as string,
    medicineId: item.medicine ?? medicineId,
    lastRestockedBy: item.lastRestockedBy ?? lastRestockedById,
  };
}

export interface CreateInventoryItemInput extends Record<string, any> {
  name: string;
  category: string;
  medicineId?: string;
  quantity?: number;
  reorderLevel?: number;
  expiryDate?: Date;
}

export async function createInventoryItem(input: CreateInventoryItemInput) {
  const { medicineId, lastRestockedBy, lastRestockedById, ...rest } = input;
  const quantity = rest.quantity ?? 0;
  const reorderLevel = rest.reorderLevel ?? 10;
  const status = computeInventoryStatus(quantity, reorderLevel, rest.expiryDate);

  const item = await prisma.inventoryItem.create({
    data: {
      ...rest,
      category: toDbEnum(rest.category) as Prisma.InventoryItemCreateInput['category'],
      quantity,
      reorderLevel,
      status: status as Prisma.InventoryItemCreateInput['status'],
      medicine: medicineId ? { connect: { id: medicineId } } : undefined,
    },
    include: fullInclude,
  });
  return toInventoryItemDTO(item);
}

export interface ListInventoryFilter {
  category?: string;
  status?: string | string[];
}

export function buildInventoryWhere(filter: ListInventoryFilter): Prisma.InventoryItemWhereInput {
  const where: Prisma.InventoryItemWhereInput = {};
  if (filter.category) where.category = toDbEnum(filter.category) as Prisma.EnumInventoryCategoryFilter['equals'];
  if (filter.status) {
    where.status = Array.isArray(filter.status)
      ? { in: filter.status.map(toDbEnum) as Prisma.EnumInventoryStatusFilter['in'] }
      : (toDbEnum(filter.status) as Prisma.EnumInventoryStatusFilter['equals']);
  }
  return where;
}

export async function listInventoryItems(where: Prisma.InventoryItemWhereInput) {
  const items = await prisma.inventoryItem.findMany({
    where,
    include: fullInclude,
    orderBy: { name: 'asc' },
  });
  return items.map(toInventoryItemDTO);
}

export async function getInventoryItemById(id: string) {
  const item = await prisma.inventoryItem.findUnique({ where: { id }, include: fullInclude });
  return item ? toInventoryItemDTO(item) : null;
}

export async function getInventoryItemRaw(id: string) {
  return prisma.inventoryItem.findUnique({ where: { id } });
}

export async function updateInventoryItem(id: string, body: Record<string, any>, restockedByUserId?: string) {
  const { medicineId, lastRestockedBy, lastRestockedById, category, status, ...rest } = body;

  const current = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!current) return null;

  const quantity = rest.quantity !== undefined ? rest.quantity : current.quantity;
  const reorderLevel = rest.reorderLevel !== undefined ? rest.reorderLevel : current.reorderLevel;
  const expiryDate = rest.expiryDate !== undefined ? rest.expiryDate : current.expiryDate;
  const computedStatus = computeInventoryStatus(quantity, reorderLevel, expiryDate);

  const data: Prisma.InventoryItemUpdateInput = {
    ...rest,
    status: computedStatus as Prisma.InventoryItemUpdateInput['status'],
  };
  if (category !== undefined) data.category = toDbEnum(category) as Prisma.InventoryItemUpdateInput['category'];
  if (medicineId !== undefined) data.medicine = medicineId ? { connect: { id: medicineId } } : { disconnect: true };

  // Track restock when quantity increases
  if (rest.quantity !== undefined && rest.quantity > current.quantity && restockedByUserId) {
    data.lastRestocked = new Date();
    data.lastRestockedBy = { connect: { id: restockedByUserId } };
  }

  const item = await prisma.inventoryItem.update({ where: { id }, data, include: fullInclude });
  return toInventoryItemDTO(item);
}

// ── Automation support (lib/automations/expiry-monitoring.ts) ───────────────

/** Inventory items with a non-null expiryDate in [from, to], excluding already-expired status. */
export async function listInventoryExpiringInRange(from: Date, to: Date) {
  const items = await prisma.inventoryItem.findMany({
    where: {
      expiryDate: { gte: from, lte: to },
      status: { not: 'expired' },
    },
    include: fullInclude,
  });
  return items.map(toInventoryItemDTO);
}

export async function deleteInventoryItem(id: string) {
  return prisma.inventoryItem.delete({ where: { id } });
}
