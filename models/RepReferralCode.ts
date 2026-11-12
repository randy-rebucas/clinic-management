import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A code (and signup link, /tenant-onboard?ref=CODE) that links a clinic to a medical rep.
 * A clinic enters it when registering, or later on its billing page; the rep is then added to
 * the clinic's representatives, so the clinic can ask them to sponsor its plan.
 *
 * - `source: 'rep'`: the rep's own code, made in the Rep app. One active code per rep.
 * - `source: 'platform'`: a custom code a platform admin made for a rep (campaigns, events),
 *   optionally with a use limit and an end date.
 */
export interface IRepReferralCode extends Document {
  code: string;
  repId: Types.ObjectId;
  source: 'rep' | 'platform';
  status: 'active' | 'disabled';
  /** Platform note, e.g. "PMA convention 2026". Never shown to clinics. */
  label?: string;
  /** Clinics that may still use it; unset = no limit. */
  maxUses?: number;
  /** Clinics linked through this code. */
  uses: number;
  expiresAt?: Date;
  /** Platform admin email, or "rep". */
  createdBy: string;
  disabledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const REFERRAL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,22}[A-Z0-9]$/;

const RepReferralCodeSchema = new Schema<IRepReferralCode>(
  {
    code: { type: String, required: true, uppercase: true, trim: true, match: REFERRAL_CODE_PATTERN },
    repId: { type: Schema.Types.ObjectId, ref: 'MedicalRepresentative', required: true },
    source: { type: String, enum: ['rep', 'platform'], required: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    label: { type: String, trim: true, maxlength: 120 },
    maxUses: { type: Number, min: 1 },
    uses: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date },
    createdBy: { type: String, required: true },
    disabledAt: { type: Date },
  },
  { timestamps: true }
);

RepReferralCodeSchema.index({ code: 1 }, { unique: true });
RepReferralCodeSchema.index({ repId: 1, createdAt: -1 });
// One active personal code per rep (regenerating disables the old one first).
RepReferralCodeSchema.index(
  { repId: 1 },
  { unique: true, name: 'one_active_rep_code', partialFilterExpression: { source: 'rep', status: 'active' } }
);

export default (mongoose.models.RepReferralCode as mongoose.Model<IRepReferralCode>) ||
  mongoose.model<IRepReferralCode>('RepReferralCode', RepReferralCodeSchema);
