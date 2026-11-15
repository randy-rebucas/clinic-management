import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A create request the mobile app may send more than once (a timeout after the server already
 * saved it). The app sends the same `Idempotency-Key` on each try; the first answer is stored
 * here and replayed, so a retry never makes a second record. See lib/idempotency.ts.
 */
export interface IIdempotencyKey extends Document {
  userId: Types.ObjectId;
  /** Which create this key belongs to, e.g. 'rep-delivery'. */
  scope: string;
  key: string;
  state: 'pending' | 'done';
  statusCode?: number;
  response?: unknown;
  createdAt: Date;
  expiresAt: Date;
}

const IdempotencyKeySchema = new Schema<IIdempotencyKey>({
  userId: { type: Schema.Types.ObjectId, required: true },
  scope: { type: String, required: true },
  key: { type: String, required: true },
  state: { type: String, enum: ['pending', 'done'], required: true },
  statusCode: { type: Number },
  response: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

// Claiming a key is an insert: the unique index makes a second claim fail.
IdempotencyKeySchema.index({ userId: 1, scope: 1, key: 1 }, { unique: true });
IdempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.IdempotencyKey ||
  mongoose.model<IIdempotencyKey>('IdempotencyKey', IdempotencyKeySchema);
