import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IInventoryItem extends Document {
  medicineId?: Types.ObjectId; // Reference to Medicine
  name: string;
  category: 'medicine' | 'supply' | 'equipment' | 'other';
  sku?: string; // Stock Keeping Unit
  quantity: number;
  unit: string; // e.g., "pieces", "boxes", "bottles"
  reorderLevel: number; // Minimum quantity before reordering
  reorderQuantity: number; // Quantity to order when reordering
  unitCost: number; // Cost per unit
  supplier?: string;
  expiryDate?: Date; // For medicines with expiry
  location?: string; // Storage location
  notes?: string;
  lastRestocked?: Date;
  lastRestockedBy?: Types.ObjectId;
  status: 'in-stock' | 'low-stock' | 'out-of-stock' | 'expired';
  createdAt: Date;
  updatedAt: Date;
}

const InventoryItemSchema: Schema = new Schema(
  {
    medicineId: { type: Schema.Types.ObjectId, ref: 'Medicine' },
    name: { type: String, required: true, trim: true, index: true },
    category: {
      type: String,
      enum: ['medicine', 'supply', 'equipment', 'other'],
      required: true,
      index: true,
    },
    sku: { type: String, trim: true, index: true, sparse: true },
    quantity: { type: Number, required: true, min: 0, default: 0 },
    unit: { type: String, default: 'pieces', trim: true },
    reorderLevel: { type: Number, default: 10, min: 0 },
    reorderQuantity: { type: Number, default: 50, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
    supplier: { type: String, trim: true },
    expiryDate: { type: Date },
    location: { type: String, trim: true },
    notes: { type: String },
    lastRestocked: { type: Date },
    lastRestockedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['in-stock', 'low-stock', 'out-of-stock', 'expired'],
      default: 'in-stock',
    },
  },
  { timestamps: true }
);

// Indexes for efficient queries
InventoryItemSchema.index({ category: 1, status: 1 });
InventoryItemSchema.index({ name: 'text' });
InventoryItemSchema.index({ status: 1 });
InventoryItemSchema.index({ expiryDate: 1 });
InventoryItemSchema.index({ medicineId: 1 });
InventoryItemSchema.index({ medicineId: 1, status: 1 }); // For medicine-specific status queries
InventoryItemSchema.index({ lastRestockedBy: 1 });
InventoryItemSchema.index({ status: 1, expiryDate: 1 }); // For low-stock/expired queries
InventoryItemSchema.index({ sku: 1 }); // For SKU lookups (sparse already set)

// Pre-save hook to update status based on quantity and expiry
InventoryItemSchema.pre('save', function (this: IInventoryItem, next) {
  const now = new Date();
  
  // Check expiry
  if (this.expiryDate && this.expiryDate < now) {
    this.status = 'expired';
  } else if (this.quantity === 0) {
    this.status = 'out-of-stock';
  } else if (this.quantity <= this.reorderLevel) {
    this.status = 'low-stock';
  } else {
    this.status = 'in-stock';
  }
  
  next();
});

export default mongoose.models.InventoryItem || mongoose.model<IInventoryItem>('InventoryItem', InventoryItemSchema);

