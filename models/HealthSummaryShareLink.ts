import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A link a patient made to share their health summary PDF with someone outside the app (another
 * doctor). Unlike the 10-minute signed links (lib/health-summary-link.ts) it lasts up to 30 days,
 * so it is stored and can be revoked. See lib/health-summary-share.ts.
 *
 * Only a hash of the token is kept: the URL itself is shown once, to the patient who made it.
 *
 * - `patient`: the record whose summary the link shows (a family member's when shared for one).
 * - `tid`: the clinic scope of the session that made it (absent = every clinic), as the in-app
 *   summary and its PDF use.
 * - `sharedBy` / `account`: set when the link was made for a family member (a dependant). Every
 *   open checks the sharer still manages that person, so ending the family link ends the share.
 */
export interface IHealthSummaryShareLink extends Document {
  tokenHash: string;
  patient: Types.ObjectId;
  tid?: Types.ObjectId;
  /** The signed-in patient record that shared a family member's summary. */
  sharedBy?: Types.ObjectId;
  /** The eMCR account through which a family member's summary was shared. */
  account?: Types.ObjectId;
  /** Who it is for, in the patient's words ("Dr. Santos, cardiology"). Shown only to the patient. */
  label?: string;
  expiresAt: Date;
  revokedAt?: Date;
  accessCount: number;
  lastAccessedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const HealthSummaryShareLinkSchema = new Schema<IHealthSummaryShareLink>(
  {
    tokenHash: { type: String, required: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    tid: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    sharedBy: { type: Schema.Types.ObjectId, ref: 'Patient' },
    account: { type: Schema.Types.ObjectId, ref: 'EmcrAccount' },
    label: { type: String, trim: true, maxlength: 80 },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    accessCount: { type: Number, default: 0 },
    lastAccessedAt: { type: Date },
  },
  { timestamps: true }
);

HealthSummaryShareLinkSchema.index({ tokenHash: 1 }, { unique: true });
HealthSummaryShareLinkSchema.index({ patient: 1, expiresAt: -1 });

export default mongoose.models.HealthSummaryShareLink ||
  mongoose.model<IHealthSummaryShareLink>('HealthSummaryShareLink', HealthSummaryShareLinkSchema);
