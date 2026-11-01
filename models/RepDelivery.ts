import mongoose, { Schema, Document, Types } from 'mongoose';

export const REP_DELIVERY_KINDS = ['sample', 'delivery'] as const;
export type RepDeliveryKind = (typeof REP_DELIVERY_KINDS)[number];

export const REP_DELIVERY_STATUSES = ['pending', 'received', 'rejected', 'cancelled'] as const;
export type RepDeliveryStatus = (typeof REP_DELIVERY_STATUSES)[number];

export interface IRepDeliveryLine {
  productId: Types.ObjectId;
  /** The product as it was when delivered, so the record reads the same after the rep edits it. */
  productName: string;
  strength?: string;
  quantity: number;
  unit: string;
  lotNumber?: string;
  /** The batch's expiry, for tracing a recall or an expiring batch to the clinics that have it. */
  expiryDate?: Date;
  /** What the clinic counted on receipt (defaults to `quantity`). */
  receivedQuantity?: number;
  /** The clinic's stock item the received units went into, if any. */
  inventoryItemId?: Types.ObjectId;
}

/**
 * Products a rep left at a clinic (samples) or delivered there, recorded against one of the rep's
 * visits. The clinic confirms receipt, which can put the units into its stock.
 */
export interface IRepDelivery extends Document {
  /** The rep's tenant scope, as on their other records (usually none). */
  tenantId?: Types.ObjectId;
  userId: Types.ObjectId;
  medicalRepresentativeId?: Types.ObjectId;
  repName: string;
  repCompany?: string;
  /** The receiving clinic (a tenant). */
  clinicId: Types.ObjectId;
  clinicName: string;
  visitId: Types.ObjectId;
  kind: RepDeliveryKind;
  lines: IRepDeliveryLine[];
  note?: string;
  status: RepDeliveryStatus;
  clinicNote?: string;
  respondedAt?: Date;
  respondedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LineSchema = new Schema<IRepDeliveryLine>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    strength: String,
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String, required: true },
    lotNumber: String,
    expiryDate: Date,
    receivedQuantity: { type: Number, min: 0 },
    inventoryItemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem' },
  },
  { _id: false }
);

const RepDeliverySchema = new Schema<IRepDelivery>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    medicalRepresentativeId: { type: Schema.Types.ObjectId, ref: 'MedicalRepresentative' },
    repName: { type: String, required: true },
    repCompany: String,
    clinicId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    clinicName: { type: String, required: true },
    visitId: { type: Schema.Types.ObjectId, ref: 'MedicalRepresentativeVisit', required: true },
    kind: { type: String, enum: REP_DELIVERY_KINDS, required: true },
    lines: { type: [LineSchema], required: true },
    note: { type: String, maxlength: 1000 },
    status: { type: String, enum: REP_DELIVERY_STATUSES, default: 'pending' },
    clinicNote: { type: String, maxlength: 1000 },
    respondedAt: Date,
    respondedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// The rep's lists: by visit, by product ("where it is"), newest first.
RepDeliverySchema.index({ userId: 1, createdAt: -1 });
RepDeliverySchema.index({ userId: 1, 'lines.productId': 1 });
RepDeliverySchema.index({ visitId: 1 });
// The clinic's "Received from reps" list.
RepDeliverySchema.index({ clinicId: 1, status: 1, createdAt: -1 });

export default mongoose.models.RepDelivery || mongoose.model<IRepDelivery>('RepDelivery', RepDeliverySchema);
