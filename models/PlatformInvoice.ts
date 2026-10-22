import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import type { BillingIssuer } from '@/lib/platform-config-schema';

/**
 * A BIR sales invoice from the platform (DevCom Digital) to a clinic for one subscription
 * payment (lib/platform-invoice.ts). One per order. Never deleted: a refunded payment's invoice
 * is marked cancelled and keeps its serial.
 *
 * status: pending (claimed, no serial yet), held (waiting for the issuer details or a new serial
 * range in Platform → Configuration), issued, cancelled.
 */
export type PlatformInvoiceStatus = 'pending' | 'held' | 'issued' | 'cancelled';

export interface PlatformInvoiceBuyer {
  registeredName: string;
  tin: string;
  address: string;
  email: string;
}

export interface IPlatformInvoice extends Document {
  orderId: string;
  tenantId: Types.ObjectId;
  transactionId?: string;
  serialNo?: string;
  status: PlatformInvoiceStatus;
  heldReason?: string;
  lockAt?: Date;
  plan: string;
  billingCycle: 'monthly' | 'yearly';
  /** The paid-until date the payment brought the clinic to, at activation. */
  paidThrough?: Date;
  paidAt: Date;
  amount: number;
  currency: string;
  vatableSales: number;
  vatAmount: number;
  /** The issuer's details as they were at issue; later edits never change a past invoice. */
  seller?: BillingIssuer;
  buyer?: PlatformInvoiceBuyer;
  issuedAt?: Date;
  cancelledAt?: Date;
  cancelledReason?: string;
  emailedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PlatformInvoiceSchema = new Schema<IPlatformInvoice>(
  {
    orderId: { type: String, required: true, unique: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    transactionId: { type: String },
    serialNo: { type: String },
    status: { type: String, enum: ['pending', 'held', 'issued', 'cancelled'], default: 'pending', index: true },
    heldReason: { type: String },
    lockAt: { type: Date },
    plan: { type: String, required: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true },
    paidThrough: { type: Date },
    paidAt: { type: Date, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'PHP' },
    vatableSales: { type: Number, default: 0 },
    vatAmount: { type: Number, default: 0 },
    seller: { type: Schema.Types.Mixed },
    buyer: { type: Schema.Types.Mixed },
    issuedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelledReason: { type: String },
    emailedAt: { type: Date },
  },
  { timestamps: true }
);

PlatformInvoiceSchema.index({ serialNo: 1 }, { unique: true, partialFilterExpression: { serialNo: { $type: 'string' } } });
PlatformInvoiceSchema.index({ tenantId: 1, paidAt: -1 });

const PlatformInvoice: Model<IPlatformInvoice> =
  (mongoose.models.PlatformInvoice as Model<IPlatformInvoice>) ||
  mongoose.model<IPlatformInvoice>('PlatformInvoice', PlatformInvoiceSchema);

export default PlatformInvoice;
