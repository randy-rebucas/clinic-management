import mongoose, { Schema, Document } from 'mongoose';

/**
 * A public rep signup waiting for its email to be confirmed. Nothing else exists until then: no
 * rep, no login, no payment. So a stranger typing someone's address leaves no trace but one email.
 * One per address; signing up again replaces it.
 */
export interface IRepSignup extends Document {
  email: string;
  /** sha256 of the emailed token; the raw token is never stored. */
  tokenHash: string;
  fields: {
    firstName: string;
    lastName: string;
    phone: string;
    company: string;
    territory?: string;
    products: string[];
    title?: string;
    bio?: string;
  };
  expiresAt: Date;
}

const RepSignupSchema = new Schema<IRepSignup>({
  email: { type: String, required: true },
  tokenHash: { type: String, required: true },
  fields: {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    phone: { type: String, required: true },
    company: { type: String, required: true },
    territory: { type: String },
    products: { type: [String], default: [] },
    title: { type: String },
    bio: { type: String },
  },
  expiresAt: { type: Date, required: true },
});

RepSignupSchema.index({ email: 1 }, { unique: true });
RepSignupSchema.index({ tokenHash: 1 }, { unique: true });
RepSignupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default (mongoose.models.RepSignup as mongoose.Model<IRepSignup>) ||
  mongoose.model<IRepSignup>('RepSignup', RepSignupSchema);
