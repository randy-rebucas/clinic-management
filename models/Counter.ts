import mongoose, { Schema, Document, Model, Types } from 'mongoose';

/**
 * Atomic per-tenant sequence counters (appointment codes, invoice numbers, etc.).
 * Replaces "find the highest code and add one", which races under concurrency and
 * breaks once string-sorted codes outgrow their zero padding.
 */
export interface ICounter extends Document {
  tenantId: Types.ObjectId | null;
  key: string;
  seq: number;
}

const CounterSchema = new Schema<ICounter>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
    key: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

CounterSchema.index({ tenantId: 1, key: 1 }, { unique: true });

const Counter: Model<ICounter> =
  (mongoose.models.Counter as Model<ICounter>) || mongoose.model<ICounter>('Counter', CounterSchema);

export default Counter;
