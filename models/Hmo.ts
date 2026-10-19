import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * An HMO, insurer or company the clinic bills: who to send claims to, when they pay, and the
 * tax they usually withhold (expanded withholding tax certified on BIR Form 2307).
 */
export interface IHmo extends Document {
  tenantId: Types.ObjectId;
  name: string;
  kind: 'hmo' | 'insurer' | 'company';
  code?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  /** Days from submission the payer is expected to pay in. */
  paymentTermsDays: number;
  /** Percent of the clinic's services (net of VAT) the payer usually withholds. */
  withholdingServicesRate: number;
  /** Percent of professional fees (net of VAT) the payer usually withholds. */
  withholdingProfessionalRate: number;
  /** A letter of authorization (approval code) must be on a claim before it can be sent. */
  requiresLoa: boolean;
  notes?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const HmoSchema = new Schema<IHmo>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ['hmo', 'insurer', 'company'], default: 'hmo' },
    code: { type: String, trim: true },
    contactName: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    paymentTermsDays: { type: Number, default: 30, min: 0, max: 3650 },
    withholdingServicesRate: { type: Number, default: 2, min: 0, max: 100 },
    withholdingProfessionalRate: { type: Number, default: 10, min: 0, max: 100 },
    requiresLoa: { type: Boolean, default: true },
    notes: { type: String },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

HmoSchema.index({ tenantId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
HmoSchema.index({ tenantId: 1, active: 1 });

export default (mongoose.models.Hmo as mongoose.Model<IHmo>) || mongoose.model<IHmo>('Hmo', HmoSchema);
