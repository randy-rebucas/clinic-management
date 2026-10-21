import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Mobile app refresh tokens (patients and medical representatives). Only the SHA-256 of the
 * token is stored. Tokens rotate: each refresh marks the old row used and issues a new one in
 * the same `family`; presenting a used token again revokes the whole family (theft signal).
 * A token also dies when the subject's session version moves on (password change,
 * "sign out everywhere"), so no separate revocation sweep is needed for those.
 */
export interface IRefreshToken extends Document {
  tokenHash: string;
  family: string;
  subjectType: 'patient' | 'user';
  subjectId: Types.ObjectId;
  /** Patient.sessionVersion / User.sessionVersion at issue time. */
  sessionVersion: number;
  /**
   * Patient tokens only: the clinic scope (`tid`) of the sign-in this chain started from.
   * Every access token minted from the chain carries the same scope.
   */
  scopeTenantId?: Types.ObjectId;
  /** Patient tokens only: the eMCR account (`acc`) and holder relation (`rel`) of the sign-in. */
  scopeAccountId?: Types.ObjectId;
  scopeRel?: 'guardian';
  expiresAt: Date;
  usedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    subjectType: { type: String, enum: ['patient', 'user'], required: true },
    subjectId: { type: Schema.Types.ObjectId, required: true, index: true },
    sessionVersion: { type: Number, default: 0 },
    scopeTenantId: { type: Schema.Types.ObjectId },
    scopeAccountId: { type: Schema.Types.ObjectId },
    scopeRel: { type: String, enum: ['guardian'] },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: true }
);

// Expired rows are removed by MongoDB.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.RefreshToken ||
  mongoose.model<IRefreshToken>('RefreshToken', RefreshTokenSchema);
