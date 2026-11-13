import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A medical rep's AI assistant use in one calendar month (Manila time): the actions counted
 * against their monthly allowance, and the tokens spent, for watching what the feature costs.
 * One row per rep per month (lib/rep-ai-usage.ts).
 */
export interface IRepAiUsage extends Document {
  userId: Types.ObjectId;
  /** "YYYY-MM" in Asia/Manila. */
  month: string;
  actions: number;
  /** Actions per feature, e.g. { visitNote: 12, visitBrief: 30 }. */
  byFeature: Record<string, number>;
  inputTokens: number;
  outputTokens: number;
  createdAt: Date;
  updatedAt: Date;
}

const RepAiUsageSchema = new Schema<IRepAiUsage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    actions: { type: Number, default: 0, min: 0 },
    byFeature: { type: Schema.Types.Mixed, default: {} },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
  },
  { timestamps: true, minimize: false }
);

// One row per rep per month; the allowance check relies on it (lib/rep-ai-usage.ts).
RepAiUsageSchema.index({ userId: 1, month: 1 }, { unique: true });

export default (mongoose.models.RepAiUsage as mongoose.Model<IRepAiUsage>) ||
  mongoose.model<IRepAiUsage>('RepAiUsage', RepAiUsageSchema);
