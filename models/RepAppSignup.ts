import mongoose, { Schema, Document } from 'mongoose';

/**
 * A medical rep signing up in the rep app, waiting for its codes: first the email code, then the
 * phone code (texted only once the inbox is proven, so the form can't be used to text strangers).
 * Nothing else exists until both pass and a password is chosen: no rep, no login, no payment.
 *
 * Kept apart from RepSignup (the web's emailed-link signup) on purpose: an app signup id must never
 * be accepted by the web confirm route, which would skip the phone check.
 * One per address; starting again replaces it.
 */
export interface IRepAppSignup extends Document {
  email: string;
  /** sha256 of the signup id the app holds; the raw id is never stored. */
  tokenHash: string;
  fields: {
    firstName: string;
    lastName: string;
    company: string;
    territory?: string;
    title?: string;
  };
  /** E.164; the code for it lives in OtpChallenge (scope `medrep-signup`). */
  phoneE164: string;
  /** bcrypt hash of the emailed code. */
  emailCodeHash: string;
  emailCodeExpiresAt: Date;
  emailCodeAttempts: number;
  emailVerifiedAt?: Date;
  phoneVerifiedAt?: Date;
  /**
   * Started for an address that already has an account: its code never matches and it can't be
   * completed (the owner was emailed instead). It exists so the routes answer exactly as for a new
   * address, and can't be used to find out which emails are registered.
   */
  decoy?: boolean;
  /** The whole signup lapses at this time; TTL-deleted. */
  expiresAt: Date;
}

const RepAppSignupSchema = new Schema<IRepAppSignup>(
  {
    email: { type: String, required: true },
    tokenHash: { type: String, required: true },
    fields: {
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
      company: { type: String, required: true },
      territory: { type: String },
      title: { type: String },
    },
    phoneE164: { type: String, required: true },
    emailCodeHash: { type: String, required: true, select: false },
    emailCodeExpiresAt: { type: Date, required: true },
    emailCodeAttempts: { type: Number, default: 0 },
    emailVerifiedAt: { type: Date },
    phoneVerifiedAt: { type: Date },
    decoy: { type: Boolean },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

RepAppSignupSchema.index({ email: 1 }, { unique: true });
RepAppSignupSchema.index({ tokenHash: 1 }, { unique: true });
RepAppSignupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default (mongoose.models.RepAppSignup as mongoose.Model<IRepAppSignup>) ||
  mongoose.model<IRepAppSignup>('RepAppSignup', RepAppSignupSchema);
