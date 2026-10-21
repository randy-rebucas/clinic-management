import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A batch of eMCR activation vouchers sold to one clinic. The clinic pays eMCR the wholesale
 * price per code in cash (or by deposit), recorded by hand in the platform console, and sells
 * each voucher to patients at face value. Codes in a batch are redeemable only once the batch
 * is marked paid, so printed but unpaid vouchers are worthless.
 */
export type VoucherBatchStatus = 'unpaid' | 'paid' | 'void';

export interface IVoucherBatch extends Document {
  batchNumber: string;
  tenantId: Types.ObjectId;
  /** The clinic's name when the batch was made; printed on every voucher. */
  clinicName: string;
  plan: 'basic' | 'plus';
  quantity: number;
  /** Days of eMCR one code gives. */
  days: number;
  /** Pesos the patient pays the clinic. */
  faceValue: number;
  /** Pesos the clinic pays eMCR per code. */
  wholesalePrice: number;
  status: VoucherBatchStatus;
  paidAt?: Date;
  /** Who took the money (platform admin email). */
  receivedBy?: string;
  /** Official receipt number or deposit reference. */
  paymentRef?: string;
  amountReceived?: number;
  voidedAt?: Date;
  voidReason?: string;
  notes?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const VoucherBatchSchema = new Schema<IVoucherBatch>(
  {
    batchNumber: { type: String, required: true, unique: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    clinicName: { type: String, required: true, trim: true },
    plan: { type: String, enum: ['basic', 'plus'], default: 'basic' },
    quantity: { type: Number, required: true, min: 1 },
    days: { type: Number, required: true, min: 1 },
    faceValue: { type: Number, required: true, min: 0 },
    wholesalePrice: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['unpaid', 'paid', 'void'], default: 'unpaid', index: true },
    paidAt: { type: Date },
    receivedBy: { type: String },
    paymentRef: { type: String, trim: true },
    amountReceived: { type: Number },
    voidedAt: { type: Date },
    voidReason: { type: String, trim: true },
    notes: { type: String, trim: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.models.VoucherBatch || mongoose.model<IVoucherBatch>('VoucherBatch', VoucherBatchSchema);
