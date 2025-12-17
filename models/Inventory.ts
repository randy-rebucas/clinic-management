import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IInventoryItem extends Document {
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;
  
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
    // Tenant reference for multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    
    medicineId: { type: Schema.Types.ObjectId, ref: 'Medicine' },
    name: { type: String, required: true, trim: true, index: true },
    category: {
      type: String,
      enum: ['medicine', 'supply', 'equipment', 'other'],
      required: true,
      index: true,
    },
    sku: { type: String, trim: true },
    // sparse unique index is created explicitly below via compound index
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

// Indexes for efficient queries (tenant-scoped)
InventoryItemSchema.index({ tenantId: 1, category: 1, status: 1 });
InventoryItemSchema.index({ tenantId: 1, name: 'text' });
InventoryItemSchema.index({ tenantId: 1, status: 1 });
InventoryItemSchema.index({ tenantId: 1, expiryDate: 1 });
InventoryItemSchema.index({ tenantId: 1, medicineId: 1 });
InventoryItemSchema.index({ tenantId: 1, medicineId: 1, status: 1 }); // For medicine-specific status queries
InventoryItemSchema.index({ tenantId: 1, lastRestockedBy: 1 });
InventoryItemSchema.index({ tenantId: 1, status: 1, expiryDate: 1 }); // For low-stock/expired queries
InventoryItemSchema.index({ tenantId: 1, sku: 1 }, { unique: true, sparse: true }); // Tenant-scoped SKU

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

// Post-save hook to trigger alerts (runs after save, can be async)
InventoryItemSchema.post('save', function (this: IInventoryItem) {
  // Trigger alert if status is low-stock, out-of-stock, or expired
  // Do this asynchronously to avoid blocking
  if (this.status === 'low-stock' || this.status === 'out-of-stock' || this.status === 'expired') {
    // Schedule alert (don't wait)
    import('@/lib/automations/inventory-alerts').then(({ sendLowStockAlert }) => {
      sendLowStockAlert({
        inventoryId: this._id,
        tenantId: this.tenantId,
        alertType: this.status as 'low-stock' | 'out-of-stock' | 'expired',
        sendEmail: true,
        sendNotification: true,
      }).catch((error) => {
        console.error('Error sending inventory alert:', error);
      });
    }).catch((error) => {
      console.error('Error loading inventory alerts module:', error);
    });
  }
});

export default mongoose.models.InventoryItem || mongoose.model<IInventoryItem>('InventoryItem', InventoryItemSchema);

