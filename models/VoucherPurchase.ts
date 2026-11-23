import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * One eMCR activation voucher bought online (the /voucher page, paid through the platform's
 * PayMongo account). The code is drawn when the purchase starts but only becomes redeemable when
 * the payment lands: that is when its ActivationCode row is written (lib/emcr/voucher-purchase).
 * `token` is the secret in the buyer's return link, so only they can see the code.
 */
export type VoucherPurchaseStatus = 'pending' | 'paid';

export interface IVoucherPurchase extends Document {
  token: string;
  email: string;
  amount: number;
  days: number;
  status: VoucherPurchaseStatus;
  /** The code, encrypted; shown on the return page and emailed once paid. */
  codeEncrypted: string;
  checkoutSessionId?: string;
  paymentId?: string;
  paidAmount?: number;
  paidAt?: Date;
  activationCodeId?: Types.ObjectId;
  emailedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const VoucherPurchaseSchema = new Schema<IVoucherPurchase>(
  {
    token: { type: String, required: true, unique: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    amount: { type: Number, required: true, min: 0 },
    days: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    codeEncrypted: { type: String, required: true, select: false },
    checkoutSessionId: { type: String },
    paymentId: { type: String },
    paidAmount: { type: Number },
    paidAt: { type: Date },
    activationCodeId: { type: Schema.Types.ObjectId, ref: 'ActivationCode' },
    emailedAt: { type: Date },
  },
  { timestamps: true }
);

// Unpaid checkouts are dropped after 30 days; paid ones are kept as the sales record.
VoucherPurchaseSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60, partialFilterExpression: { status: 'pending' } }
);

// Platform console: the newest first by status, a buyer's purchases, and paid sales by month.
VoucherPurchaseSchema.index({ status: 1, createdAt: -1 });
VoucherPurchaseSchema.index({ email: 1, createdAt: -1 });
VoucherPurchaseSchema.index({ status: 1, paidAt: 1 });

export default mongoose.models.VoucherPurchase ||
  mongoose.model<IVoucherPurchase>('VoucherPurchase', VoucherPurchaseSchema);
