import mongoose, { Schema, Document } from 'mongoose';

/**
 * A spent single-use token id (platform sign-in links, "view as clinic" hand-offs).
 * Inserting the jti is how a token is consumed: the unique index makes a second use fail.
 * Rows expire with the token they guard.
 */
export interface IPlatformNonce extends Document {
  jti: string;
  purpose: 'platform-login' | 'view-as';
  expiresAt: Date;
}

const PlatformNonceSchema = new Schema<IPlatformNonce>({
  jti: { type: String, required: true, unique: true },
  purpose: { type: String, enum: ['platform-login', 'view-as'], required: true },
  expiresAt: { type: Date, required: true },
});

PlatformNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.PlatformNonce ||
  mongoose.model<IPlatformNonce>('PlatformNonce', PlatformNonceSchema);
