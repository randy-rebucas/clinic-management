import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * One change to an inventory item's stock: the clinic's stock ledger. Written by the inventory
 * API (opening stock, restock, adjustment, count) and by prescription dispensing, so an item's
 * history and its daily use are read from here, never reconstructed from free-text notes.
 */
import { ADJUST_REASONS, type AdjustReason, type MovementType } from '@/lib/inventory';

export type { AdjustReason, MovementType };

export interface IInventoryMovement extends Document {
  tenantId: Types.ObjectId;
  item: Types.ObjectId;
  type: MovementType;
  /** Signed change in the item's unit (+ in, − out). */
  change: number;
  /** Stock right after this change. */
  quantityAfter: number;
  /** Adjustment: why, as a fixed choice ("used" counts towards daily use). */
  reasonCode?: AdjustReason;
  reason?: string;
  /** Restock: cost per unit paid, supplier, delivery or order reference, the batch's expiry. */
  unitCost?: number;
  supplier?: string;
  reference?: string;
  batchExpiry?: Date;
  /** Dispense: which prescription it went out on. */
  prescription?: Types.ObjectId;
  prescriptionCode?: string;
  performedBy?: Types.ObjectId;
  performedByName?: string;
  createdAt: Date;
}

const InventoryMovementSchema = new Schema<IInventoryMovement>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    item: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    type: { type: String, enum: ['opening', 'restock', 'adjustment', 'count', 'dispense', 'dispense-reversal'], required: true },
    change: { type: Number, required: true },
    quantityAfter: { type: Number, required: true },
    reasonCode: { type: String, enum: ADJUST_REASONS },
    reason: { type: String, trim: true, maxlength: 2000 },
    unitCost: { type: Number, min: 0 },
    supplier: { type: String, trim: true },
    reference: { type: String, trim: true },
    batchExpiry: { type: Date },
    prescription: { type: Schema.Types.ObjectId, ref: 'Prescription' },
    prescriptionCode: { type: String },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    performedByName: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

InventoryMovementSchema.index({ tenantId: 1, item: 1, createdAt: -1 });
InventoryMovementSchema.index({ tenantId: 1, type: 1, createdAt: -1 });

export default (mongoose.models.InventoryMovement as mongoose.Model<IInventoryMovement>) ||
  mongoose.model<IInventoryMovement>('InventoryMovement', InventoryMovementSchema);
