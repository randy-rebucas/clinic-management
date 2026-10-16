import { Types } from 'mongoose';
import InventoryMovement from '@/models/InventoryMovement';
import type { AdjustReason, MovementType } from '@/lib/inventory';

export interface MovementInput {
  tenantId: string | Types.ObjectId;
  item: string | Types.ObjectId;
  type: MovementType;
  change: number;
  quantityAfter: number;
  reasonCode?: AdjustReason;
  reason?: string;
  unitCost?: number;
  supplier?: string;
  reference?: string;
  batchExpiry?: Date;
  prescription?: string | Types.ObjectId;
  prescriptionCode?: string;
  performedBy?: string | Types.ObjectId;
  performedByName?: string;
}

/**
 * Record a stock change after it has been applied. A failure to write the ledger is logged and
 * swallowed: the stock itself is already right, and the change must not be reported as failed.
 */
export async function recordMovement(input: MovementInput): Promise<void> {
  if (!input.change) return;
  try {
    await InventoryMovement.create({
      ...input,
      tenantId: new Types.ObjectId(String(input.tenantId)),
      item: new Types.ObjectId(String(input.item)),
      performedBy: input.performedBy ? new Types.ObjectId(String(input.performedBy)) : undefined,
      prescription: input.prescription ? new Types.ObjectId(String(input.prescription)) : undefined,
    });
  } catch (error) {
    console.error('Failed to record inventory movement:', error);
  }
}

/** Stock used up, for days-of-stock-left: medicines dispensed, and supplies marked used in the clinic. */
export const USAGE_MATCH = {
  $or: [{ type: 'dispense' }, { type: 'adjustment', reasonCode: 'used' }],
};
