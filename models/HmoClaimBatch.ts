import mongoose, { Schema, Document, Types } from 'mongoose';

export type BatchStatus = 'draft' | 'submitted' | 'partial' | 'paid' | 'closed';
export type ClaimLineStatus = 'pending' | 'paid' | 'short_paid' | 'denied';

export interface IClaimLine {
  invoice: Types.ObjectId;
  invoiceNumber: string;
  patientName: string;
  memberId?: string;
  loaNumber?: string;
  /** Amount claimed from the payer. */
  amount: number;
  /** Money received, net of withholding. */
  paid: number;
  /** Tax withheld and certified on Form 2307. */
  withheld: number;
  /** What the payer is likely to withhold (lib/hmo.ts suggestedWithholding), worked out when sent. */
  suggestedWithheld: number;
  status: ClaimLineStatus;
  denialReason?: string;
}

export interface IRemittance {
  _id?: Types.ObjectId;
  date: Date;
  reference?: string;
  net: number;
  withheld: number;
  form2307Received: boolean;
  recordedBy?: Types.ObjectId;
  notes?: string;
}

/**
 * A transmittal: claims to one payer sent together, then paid (often in one cheque or transfer
 * for the lot, less withholding) and reconciled claim by claim.
 */
export interface IHmoClaimBatch extends Document {
  tenantId: Types.ObjectId;
  hmo: Types.ObjectId;
  hmoName: string;
  batchNumber: string;
  status: BatchStatus;
  claims: IClaimLine[];
  totalClaimed: number;
  submittedAt?: Date;
  dueAt?: Date;
  remittances: IRemittance[];
  notes?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ClaimLineSchema = new Schema<IClaimLine>(
  {
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    invoiceNumber: String,
    patientName: String,
    memberId: String,
    loaNumber: String,
    amount: { type: Number, required: true },
    paid: { type: Number, default: 0 },
    withheld: { type: Number, default: 0 },
    suggestedWithheld: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'paid', 'short_paid', 'denied'], default: 'pending' },
    denialReason: String,
  },
  { _id: false }
);

const RemittanceSchema = new Schema<IRemittance>({
  date: { type: Date, required: true },
  reference: String,
  net: { type: Number, default: 0 },
  withheld: { type: Number, default: 0 },
  form2307Received: { type: Boolean, default: false },
  recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  notes: String,
});

const HmoClaimBatchSchema = new Schema<IHmoClaimBatch>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    hmo: { type: Schema.Types.ObjectId, ref: 'Hmo', required: true },
    hmoName: { type: String, required: true },
    batchNumber: { type: String, required: true },
    status: { type: String, enum: ['draft', 'submitted', 'partial', 'paid', 'closed'], default: 'draft' },
    claims: { type: [ClaimLineSchema], default: [] },
    totalClaimed: { type: Number, default: 0 },
    submittedAt: Date,
    dueAt: Date,
    remittances: { type: [RemittanceSchema], default: [] },
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

HmoClaimBatchSchema.index({ tenantId: 1, batchNumber: 1 }, { unique: true });
HmoClaimBatchSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
HmoClaimBatchSchema.index({ tenantId: 1, hmo: 1, createdAt: -1 });

export default (mongoose.models.HmoClaimBatch as mongoose.Model<IHmoClaimBatch>) || mongoose.model<IHmoClaimBatch>('HmoClaimBatch', HmoClaimBatchSchema);
