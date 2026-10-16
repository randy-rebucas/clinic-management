import { z } from 'zod';
import { zObjectId, zShortText, zMoney } from '@/lib/api/validate';

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
 * Update body. `quantity` is an absolute value (full item edit / "set to");
 * `delta` is a relative change applied atomically (restock / add / subtract).
 */
export const inventoryUpdateSchema = z
  .object({
    ...inventoryFields,
    name: inventoryFields.name.optional(),
    category: inventoryFields.category.optional(),
    delta: z.number().finite().min(-100_000_000).max(100_000_000).refine((n) => n !== 0, 'delta must be non-zero').optional(),
  })
  .refine((b) => !(b.delta !== undefined && b.quantity !== undefined), {
    message: 'Send either quantity or delta, not both',
    path: ['delta'],
  });

export function medicinePopulate(tenantFilterValue: Record<string, unknown>) {
  return {
    path: 'medicineId',
    select: 'name genericName',
    match: tenantFilterValue,
  };
}
