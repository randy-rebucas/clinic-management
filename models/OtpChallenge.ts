import mongoose, { Schema, Document, Types } from 'mongoose';

export type OtpScope = 'patient' | 'emcr' | 'public' | 'medrep-signup' | 'medrep-login';
export type OtpProvider = 'local' | 'verify';

/**
 * One live phone code. Twilio Verify knows only the number, so this keeps what the code was for:
 * the record it opens (which may be a minor reached through a parent's contact number), and the
 * attempt count, raised atomically so parallel guesses stay capped.
 *
 * One per scope and number: a new request replaces the old one. A right code deletes it.
 */
export interface IOtpChallenge extends Document {
  scope: OtpScope;
  phoneE164: string;
  /** Which public form the code is for. Other scopes share a code across their routes on purpose. */
  purpose?: string;
  patientId?: Types.ObjectId;
  tenantId?: Types.ObjectId;
  /** Who checks the code. Stored, so switching OTP_PROVIDER doesn't strand codes already sent. */
  provider: OtpProvider;
  /** bcrypt hash; `local` provider only. */
  codeHash?: string;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OtpChallengeSchema = new Schema<IOtpChallenge>(
  {
    scope: { type: String, enum: ['patient', 'emcr', 'public', 'medrep-signup', 'medrep-login'], required: true },
    phoneE164: { type: String, required: true },
    purpose: { type: String },
    // No `ref`: this row expires by itself, so patient erasure has nothing to follow.
    patientId: { type: Schema.Types.ObjectId },
    tenantId: { type: Schema.Types.ObjectId },
    provider: { type: String, enum: ['local', 'verify'], required: true },
    codeHash: { type: String, select: false },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

OtpChallengeSchema.index({ scope: 1, phoneE164: 1 }, { unique: true });
OtpChallengeSchema.index({ patientId: 1 }, { partialFilterExpression: { patientId: { $type: 'objectId' } } });
OtpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default (mongoose.models.OtpChallenge as mongoose.Model<IOtpChallenge>) ||
  mongoose.model<IOtpChallenge>('OtpChallenge', OtpChallengeSchema);
