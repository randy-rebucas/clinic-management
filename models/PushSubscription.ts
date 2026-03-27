import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPushSubscription extends Document {
  tenantId?: Types.ObjectId;
  userId: Types.ObjectId;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String },
  },
  { timestamps: true }
);

// One subscription record per endpoint — prevent duplicates
PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
// Efficient lookup by tenant + user
PushSubscriptionSchema.index({ tenantId: 1, userId: 1 });

export default mongoose.models.PushSubscription ||
  mongoose.model<IPushSubscription>('PushSubscription', PushSubscriptionSchema);
