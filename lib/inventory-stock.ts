import { Types } from 'mongoose';
import InventoryItem from '@/models/Inventory';
import type { AdjustReason } from '@/lib/inventory';
import { recordMovement, type MovementInput } from '@/lib/inventory-movements';

/** What an item looks like before the change: its stock and expiry. */
export type StockCurrent = { quantity: number; expiryDate?: Date | null };

export type StockChangeInput = {
  /** Item details to set, including `quantity` for a count ("set to") and a restock's unitCost and supplier. */
  fields: Record<string, unknown>;
  /** null clears the expiry; undefined leaves it. */
  expiryDate?: Date | null;
  /** A relative change (restock, add, take off), applied atomically. */
  delta?: number;
  kind?: 'restock' | 'adjustment' | 'count';
  reasonCode?: AdjustReason;
  reason?: string;
  reference?: string;
  batchExpiry?: Date;
  /** Restock of an expired item: take the expired units off first. */
  discardExpired?: boolean;
  /**
   * The restock's cost and supplier for the ledger line only, when they shouldn't replace the
   * item's own (a rep delivery doesn't change who the clinic usually buys from).
   */
  ledger?: { unitCost?: number; supplier?: string };
};

type PlannedLine = Omit<MovementInput, 'quantityAfter' | 'tenantId' | 'item'> & { quantityAfter?: number };

/**
 * The write for one stock change, without touching the database: the guard to add to the filter,
 * the update, and the ledger lines. Shared by PUT /api/inventory/[id] (restock, adjust, count,
 * edit) and a rep delivery received into stock, so both follow the same rules.
 */
export function planStockChange(current: StockCurrent, input: StockChangeInput, opts: { now: Date; performedBy: string }) {
  const { fields, expiryDate, delta, kind, reasonCode, reason, reference, batchExpiry, discardExpired, ledger } = input;
  const { now, performedBy } = opts;
  const expiredNow = Boolean(current.expiryDate && new Date(current.expiryDate) < now);
  const guard: Record<string, unknown> = {};
  const $set: Record<string, unknown> = { ...fields };
  const $unset: Record<string, 1> = {};
  const update: Record<string, unknown> = {};
  // Ledger lines to write once the change has landed; `after` is filled from the saved stock.
  const lines: PlannedLine[] = [];

  if (expiryDate === null) $unset.expiryDate = 1;
  else if (expiryDate !== undefined) $set.expiryDate = expiryDate;

  const restocking = (delta !== undefined && delta > 0 && kind !== 'adjustment') || kind === 'restock';
  const discarding = Boolean(restocking && discardExpired && expiredNow && current.quantity > 0);

  if (delta !== undefined && discarding) {
    // Expired units go out and the delivery comes in, in one write guarded on the stock read above.
    $set.quantity = delta;
    guard.quantity = current.quantity;
    lines.push({ type: 'adjustment', change: -current.quantity, quantityAfter: 0, reasonCode: 'expired', reason: 'Expired stock removed before restocking' });
  } else if (delta !== undefined) {
    // Relative change applied atomically so concurrent restocks/adjustments don't overwrite each other.
    update.$inc = { quantity: delta };
    if (delta < 0) guard.quantity = { $gte: -delta };
  } else if (fields.quantity !== undefined) {
    // A count sets the stock; guarded so a dispense that landed meanwhile isn't silently erased.
    guard.quantity = current.quantity;
  }

  const counted = typeof fields.quantity === 'number' ? fields.quantity : undefined;
  const change = delta ?? (counted !== undefined ? counted - current.quantity : 0);
  if (change !== 0) {
    lines.push({
      type: restocking ? 'restock' : delta !== undefined ? 'adjustment' : 'count',
      change,
      ...(reasonCode && !restocking ? { reasonCode } : {}),
      ...(reason ? { reason } : {}),
      ...(restocking
        ? {
            unitCost: (fields.unitCost as number | undefined) ?? ledger?.unitCost,
            supplier: (fields.supplier as string | undefined) ?? ledger?.supplier,
            reference,
            batchExpiry,
          }
        : {}),
    });
  }

  if (restocking) {
    $set.lastRestocked = now;
    $set.lastRestockedBy = performedBy;
    // One expiry per item: a new batch replaces an expired or empty one; otherwise the earlier date stands.
    if (batchExpiry) {
      const keepOld = current.expiryDate && !expiredNow && !discarding && current.quantity > 0 && new Date(current.expiryDate) < batchExpiry;
      if (!keepOld) $set.expiryDate = batchExpiry;
    }
  }

  for (const k of Object.keys($set)) if ($set[k] === undefined) delete $set[k];
  if (Object.keys($set).length > 0) update.$set = $set;
  if (Object.keys($unset).length > 0) update.$unset = $unset;

  return { guard, update, lines, restocking, discarding };
}

export type StockChangeResult =
  | { ok: true; item: any; restocking: boolean; discarding: boolean }
  /** not-found: no such item for this clinic; short: not that much in stock; changed: stock moved meanwhile. */
  | { ok: false; reason: 'not-found' | 'short' | 'changed' };

/** Apply a planned stock change to one item and write its ledger lines. */
export async function applyStockChange(opts: {
  /** The item's tenant-scoped filter, e.g. tenantFilter(tenantId, { _id }). */
  filter: Record<string, unknown>;
  tenantId: Types.ObjectId;
  current: StockCurrent;
  input: StockChangeInput;
  performedBy: string;
}): Promise<StockChangeResult> {
  const { filter, tenantId, current, input, performedBy } = opts;
  const plan = planStockChange(current, input, { now: new Date(), performedBy });

  const item = await InventoryItem.findOneAndUpdate({ ...filter, ...plan.guard }, plan.update, { new: true, runValidators: true });
  if (!item) {
    const exists = await InventoryItem.exists(filter);
    if (!exists) return { ok: false, reason: 'not-found' };
    return { ok: false, reason: input.delta !== undefined && input.delta < 0 ? 'short' : 'changed' };
  }

  // Write the ledger: the last line ends at the saved stock, earlier ones at their own point.
  for (let i = 0; i < plan.lines.length; i++) {
    await recordMovement({
      tenantId,
      item: item._id,
      ...plan.lines[i],
      quantityAfter: i === plan.lines.length - 1 ? item.quantity : (plan.lines[i].quantityAfter ?? item.quantity),
      performedBy,
    });
  }
  return { ok: true, item, restocking: plan.restocking, discarding: plan.discarding };
}
