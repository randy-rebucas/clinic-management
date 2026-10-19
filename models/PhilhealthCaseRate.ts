import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A PhilHealth case rate the clinic bills under: an ICD-10 (medical) or RVS (procedure) code or a
 * package, the amount PhilHealth pays, and how it splits between facility and doctor. Kept by each
 * clinic from PhilHealth's circulars, since the rates change.
 */
export interface IPhilhealthCaseRate extends Document {
  tenantId: Types.ObjectId;
  code: string;
  kind: 'medical' | 'procedure' | 'package';
  description: string;
  amount: number;
  hciShare: number;
  pfShare: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PhilhealthCaseRateSchema = new Schema<IPhilhealthCaseRate>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    kind: { type: String, enum: ['medical', 'procedure', 'package'], default: 'medical' },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    hciShare: { type: Number, default: 0, min: 0 },
    pfShare: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

PhilhealthCaseRateSchema.index({ tenantId: 1, code: 1 }, { unique: true });
PhilhealthCaseRateSchema.index({ tenantId: 1, active: 1 });

export default (mongoose.models.PhilhealthCaseRate as mongoose.Model<IPhilhealthCaseRate>) ||
  mongoose.model<IPhilhealthCaseRate>('PhilhealthCaseRate', PhilhealthCaseRateSchema);
