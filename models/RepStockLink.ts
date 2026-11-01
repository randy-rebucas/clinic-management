import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A clinic's answer to "where does this rep product go in our stock?": the stock item and how
 * many stock units one delivered unit holds. Saved when the clinic receives a delivery into stock,
 * so the next delivery of the same product (in the same unit) is filled in.
 */
export interface IRepStockLink extends Document {
  /** The clinic (a tenant). */
  tenantId: Types.ObjectId;
  productId: Types.ObjectId;
  /** The rep's delivery unit, lowercased ("boxes"). */
  deliveryUnit: string;
  inventoryItemId: Types.ObjectId;
  unitsPerPack: number;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RepStockLinkSchema = new Schema<IRepStockLink>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    deliveryUnit: { type: String, required: true, lowercase: true, trim: true },
    inventoryItemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    unitsPerPack: { type: Number, required: true, min: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

RepStockLinkSchema.index({ tenantId: 1, productId: 1, deliveryUnit: 1 }, { unique: true });

export default mongoose.models.RepStockLink || mongoose.model<IRepStockLink>('RepStockLink', RepStockLinkSchema);
