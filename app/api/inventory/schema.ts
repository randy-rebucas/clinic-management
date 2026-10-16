import { z } from 'zod';
import { zObjectId, zShortText, zMoney } from '@/lib/api/validate';
import { ADJUST_REASONS, type AdjustReason } from '@/lib/inventory';

export const INVENTORY_CATEGORIES = ['medicine', 'supply', 'equipment', 'other'] as const;
export const INVENTORY_STATUSES = ['in-stock', 'low-stock', 'out-of-stock', 'expired'] as const;

const zQuantity = z.number().finite().min(0).max(100_000_000);

const inventoryFields = {
  medicineId: zObjectId.optional(),
  name: zShortText.min(1),
  category: z.enum(INVENTORY_CATEGORIES),
  sku: zShortText.optional(),
  quantity: zQuantity.optional(),
  unit: zShortText.optional(),
  reorderLevel: zQuantity.optional(),
  reorderQuantity: zQuantity.optional(),
  unitCost: zMoney.optional(),
  supplier: zShortText.optional(),
  expiryDate: z.coerce.date().optional(),
  location: zShortText.optional(),
  notes: z.string().max(10000).optional(),
};

export const inventoryCreateSchema = z.object(inventoryFields);

/**
 * Update body. `quantity` is an absolute value (a stock count, "set to");
 * `delta` is a relative change applied atomically (restock / add / take off).
 * `kind` names the stock change for the ledger; the restock fields describe the delivery.
 */
export const inventoryUpdateSchema = z
  .object({
    ...inventoryFields,
    name: inventoryFields.name.optional(),
    category: inventoryFields.category.optional(),
    // null unlinks the medicine.
    medicineId: zObjectId.nullable().optional(),
    // An empty string clears the expiry date on an item edit.
    expiryDate: z.union([z.coerce.date(), z.literal('').transform(() => null), z.null()]).optional(),
    delta: z.number().finite().min(-100_000_000).max(100_000_000).refine((n) => n !== 0, 'delta must be non-zero').optional(),
    kind: z.enum(['restock', 'adjustment', 'count']).optional(),
    reasonCode: z.enum(ADJUST_REASONS as [AdjustReason, ...AdjustReason[]]).optional(),
    reason: z.string().trim().max(2000).optional(),
    reference: zShortText.optional(),
    batchExpiry: z.coerce.date().optional(),
    /** Restock of an expired item: take the expired units off first. */
    discardExpired: z.boolean().optional(),
  })
  .refine((b) => !(b.delta !== undefined && b.quantity !== undefined), {
    message: 'Send either quantity or delta, not both',
    path: ['delta'],
  })
  .refine((b) => b.kind !== 'restock' || (b.delta !== undefined && b.delta > 0), {
    message: 'A restock adds a quantity above 0',
    path: ['delta'],
  });

export function medicinePopulate(tenantFilterValue: Record<string, unknown>) {
  return {
    path: 'medicineId',
    select: 'name genericName',
    match: tenantFilterValue,
  };
}
