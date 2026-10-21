import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * One eMCR activation voucher code. Looked up by `codeHash` (SHA-256 of the normalized code);
 * `codeEncrypted` lets the platform console reprint the voucher sheet. Redeemed once.
 */
export type ActivationCodeStatus = 'unsold' | 'redeemed' | 'void';

export interface IActivationCode extends Document {
  codeHash: string;
  codeEncrypted: string;
  /** Last 4 characters, for support lookups without the full code. */
  last4: string;
  batchId: Types.ObjectId;
  tenantId: Types.ObjectId;
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
    batchId: { type: Schema.Types.ObjectId, ref: 'VoucherBatch', required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    status: { type: String, enum: ['unsold', 'redeemed', 'void'], default: 'unsold' },
    redeemedBy: { type: Schema.Types.ObjectId, ref: 'EmcrAccount' },
    redeemedAt: { type: Date },
    voidedAt: { type: Date },
  },
  { timestamps: true }
);

ActivationCodeSchema.index({ batchId: 1, status: 1 });

export default mongoose.models.ActivationCode || mongoose.model<IActivationCode>('ActivationCode', ActivationCodeSchema);
