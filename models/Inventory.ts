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
  expiryAlertsSent?: number[];
  expiryAlertsFor?: Date;
  stockAlertStatus?: string;
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
    // Expiry alert markers: thresholds (days) already alerted for the expiryDate in expiryAlertsFor
    expiryAlertsSent: { type: [Number], default: undefined },
    expiryAlertsFor: { type: Date },
    stockAlertStatus: { type: String }, // last status an inventory alert was sent for
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
// A sparse compound index still indexes docs without sku (tenantId is present), so a partial filter is needed.
InventoryItemSchema.index(
  { tenantId: 1, sku: 1 },
  { unique: true, name: 'uniq_tenant_sku', partialFilterExpression: { sku: { $type: 'string', $gt: '' } } }
);

type InventoryStatus = IInventoryItem['status'];
type AlertStatus = 'low-stock' | 'out-of-stock' | 'expired';
const ALERT_STATUSES: InventoryStatus[] = ['low-stock', 'out-of-stock', 'expired'];

export function computeInventoryStatus(item: {
  quantity?: number;
  reorderLevel?: number;
  expiryDate?: Date | null;
}): InventoryStatus {
  const quantity = item.quantity ?? 0;
  if (item.expiryDate && new Date(item.expiryDate) < new Date()) return 'expired';
  if (quantity <= 0) return 'out-of-stock';
  if (quantity <= (item.reorderLevel ?? 10)) return 'low-stock';
  return 'in-stock';
}

function isBlank(v: unknown): boolean {
  return typeof v === 'string' && v.trim() === '';
}

// Alert only when an item moves INTO an alert state, not on every save while it stays there.
function alertOnTransition(
  id: unknown,
  tenantId: unknown,
  prev: InventoryStatus | null | undefined,
  next: InventoryStatus
) {
  if (!ALERT_STATUSES.includes(next) || prev === next) return;
  import('@/lib/automations/inventory-alerts')
    .then(({ sendLowStockAlert }) =>
      sendLowStockAlert({
        inventoryId: id as any,
        tenantId: tenantId as any,
        alertType: next as AlertStatus,
        sendEmail: true,
        sendNotification: true,
      })
    )
    .catch((error) => {
      console.error('Error sending inventory alert:', error);
    });
}

InventoryItemSchema.pre('validate', function (this: IInventoryItem, next) {
  if (isBlank(this.sku)) this.sku = undefined;
  next();
});

InventoryItemSchema.pre('save', function (this: IInventoryItem, next) {
  this.$locals.prevStatus = this.isNew ? null : this.status;
  this.status = computeInventoryStatus(this);
  next();
});

InventoryItemSchema.post('save', function (this: IInventoryItem) {
  alertOnTransition(this._id, this.tenantId, this.$locals.prevStatus as InventoryStatus | null, this.status);
});

// Query updates (findOneAndUpdate/updateOne/updateMany) bypass save hooks, so status is recomputed here.
type Snapshot = { _id: Types.ObjectId; status?: InventoryStatus; tenantId?: Types.ObjectId };

async function captureBeforeUpdate(this: mongoose.Query<any, any>, many: boolean) {
  const update = this.getUpdate() as Record<string, any> | null;
  if (update && !Array.isArray(update)) {
    for (const target of [update, update.$set]) {
      if (target && isBlank(target.sku)) {
        delete target.sku;
        update.$unset = { ...(update.$unset || {}), sku: 1 };
      }
    }
  }
  const query = this.model.find(this.getFilter()).select('_id status tenantId').lean<Snapshot[]>();
  const docs = many ? await query : await query.limit(1);
  (this as any)._inventorySnapshots = docs;
}

async function recomputeAfterUpdate(this: mongoose.Query<any, any>, result?: any) {
  const snapshots: Snapshot[] = (this as any)._inventorySnapshots || [];
  if (snapshots.length === 0) return;
  const current = await this.model
    .find({ _id: { $in: snapshots.map((d) => d._id) } })
    .select('_id quantity reorderLevel expiryDate status tenantId')
    .lean<Array<Snapshot & { quantity?: number; reorderLevel?: number; expiryDate?: Date }>>();
  const prevById = new Map(snapshots.map((d) => [String(d._id), d.status]));

  for (const doc of current) {
    const status = computeInventoryStatus(doc);
    if (status !== doc.status) {
      await this.model.collection.updateOne({ _id: doc._id }, { $set: { status } });
    }
    if (result && typeof result === 'object' && String(result._id) === String(doc._id) && result.status !== status) {
      if (typeof result.set === 'function') {
        result.set('status', status);
        result.unmarkModified('status');
      } else {
        result.status = status;
      }
    }
    alertOnTransition(doc._id, doc.tenantId, prevById.get(String(doc._id)), status);
  }
}

InventoryItemSchema.pre('findOneAndUpdate', async function () {
  await captureBeforeUpdate.call(this, false);
});
InventoryItemSchema.pre('updateOne', { document: false, query: true }, async function () {
  await captureBeforeUpdate.call(this, false);
});
InventoryItemSchema.pre('updateMany', async function () {
  await captureBeforeUpdate.call(this, true);
});
InventoryItemSchema.post('findOneAndUpdate', async function (result: any) {
  await recomputeAfterUpdate.call(this, result);
});
InventoryItemSchema.post('updateOne', { document: false, query: true }, async function () {
  await recomputeAfterUpdate.call(this);
});
InventoryItemSchema.post('updateMany', async function () {
  await recomputeAfterUpdate.call(this);
});

export default mongoose.models.InventoryItem || mongoose.model<IInventoryItem>('InventoryItem', InventoryItemSchema);

