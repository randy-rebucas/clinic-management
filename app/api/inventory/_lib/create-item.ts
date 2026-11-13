import { NextRequest } from 'next/server';
import { z } from 'zod';
import InventoryItem from '@/models/Inventory';
import Medicine from '@/models/Medicine';
import { tenantFilter, type TenantSession } from '@/lib/api/tenant-session';
import { recordMovement } from '@/lib/inventory-movements';
import { inventoryCreateSchema } from '../schema';
import { logInventoryChange, stockWords } from './inventory-audit';

export type InventoryCreateBody = z.infer<typeof inventoryCreateSchema>;

/**
 * Add a stock item the way /inventory/new does: the medicine link must be one of this clinic's,
 * the opening stock is the first line of the item's history, and the addition is audit-logged.
 * Used by POST /api/inventory and by a rep delivery received as a new stock item.
 */
export async function createInventoryItem(
  ctx: TenantSession,
  request: NextRequest,
  body: InventoryCreateBody
): Promise<{ ok: true; item: any } | { ok: false; status: 400; error: string }> {
  if (body.medicineId) {
    const medicine = await Medicine.findOne(tenantFilter(ctx.tenantId, { _id: body.medicineId })).select('_id').lean();
    if (!medicine) {
      return { ok: false, status: 400, error: 'Invalid medicine selected. Please select a medicine from this clinic.' };
    }
  }

  const item = await InventoryItem.create({ ...body, tenantId: ctx.tenantObjectId });
  // The opening stock is the first line of the item's history.
  await recordMovement({
    tenantId: ctx.tenantObjectId,
    item: item._id,
    type: 'opening',
    change: item.quantity,
    quantityAfter: item.quantity,
    performedBy: ctx.session.userId,
  });

  await logInventoryChange(ctx, request, {
    action: 'create',
    itemId: item._id,
    description: `Added ${item.name} to inventory with ${stockWords(item.quantity, item.unit)} on hand`,
    metadata: { category: item.category, quantity: item.quantity, unit: item.unit, unitCost: item.unitCost, sku: item.sku },
  });

  return { ok: true, item };
}
