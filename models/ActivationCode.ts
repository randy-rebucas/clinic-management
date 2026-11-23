import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * One eMCR activation voucher code. Looked up by `codeHash` (SHA-256 of the normalized code);
 * `codeEncrypted` lets the platform console reprint the voucher sheet. Redeemed once.
 * A clinic voucher belongs to a batch and a clinic; one bought online (/voucher) has neither and
 * points at its VoucherPurchase instead.
 */
export type ActivationCodeStatus = 'unsold' | 'redeemed' | 'void';

export interface IActivationCode extends Document {
  codeHash: string;
  codeEncrypted: string;
  /** Last 4 characters, for support lookups without the full code. */
  last4: string;
  batchId?: Types.ObjectId;
  tenantId?: Types.ObjectId;
  purchaseId?: Types.ObjectId;
  status: ActivationCodeStatus;
  redeemedBy?: Types.ObjectId;
  redeemedAt?: Date;
  voidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ActivationCodeSchema = new Schema<IActivationCode>(
  {
    codeHash: { type: String, required: true, unique: true },
    codeEncrypted: { type: String, required: true, select: false },
    last4: { type: String, required: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'VoucherBatch' },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
    purchaseId: { type: Schema.Types.ObjectId, ref: 'VoucherPurchase' },
    status: { type: String, enum: ['unsold', 'redeemed', 'void'], default: 'unsold' },
    redeemedBy: { type: Schema.Types.ObjectId, ref: 'EmcrAccount' },
    redeemedAt: { type: Date },
    voidedAt: { type: Date },
  },
  { timestamps: true }
);

ActivationCodeSchema.index({ batchId: 1, status: 1 });
// Online codes, for the platform's online-voucher page.
ActivationCodeSchema.index({ purchaseId: 1 }, { partialFilterExpression: { purchaseId: { $exists: true } } });

export default mongoose.models.ActivationCode || mongoose.model<IActivationCode>('ActivationCode', ActivationCodeSchema);
