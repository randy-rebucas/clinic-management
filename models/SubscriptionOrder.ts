import mongoose, { Schema, Document, Types } from 'mongoose';

export type SubscriptionOrderStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * A plan purchase started by a clinic: our own reference (`orderId`, pm_…) and the PayMongo
 * checkout behind it. Stored in the `paypalorders` collection, its name from when PayPal took
 * these, so older orders stay readable without a migration.
 */
export interface ISubscriptionOrder extends Document {
  orderId: string;
  tenantId: Types.ObjectId;
  plan: string;
  billingCycle: 'monthly' | 'yearly';
  amount: number;
  currency: string;
  status: SubscriptionOrderStatus;
  /** Which gateway took it. 'paypal' only on orders from before PayPal was removed. */
  provider?: 'paypal' | 'paymongo';
  /** PayMongo checkout session id (orderId is then our own reference). */
  gatewayId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionOrderSchema = new Schema<ISubscriptionOrder>(
  {
    orderId:      { type: String, required: true, unique: true },
    tenantId:     { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    plan:         { type: String, required: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true },
    amount:       { type: Number, required: true },
    currency:     { type: String, default: 'PHP' },
    status:       { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
    provider:     { type: String, enum: ['paypal', 'paymongo'], default: 'paymongo' },
    gatewayId:    { type: String, index: true, sparse: true },
  },
  { timestamps: true }
);

// Auto-expire abandoned pending orders after 2 hours
SubscriptionOrderSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7200, partialFilterExpression: { status: 'pending' } });

export default mongoose.models.SubscriptionOrder ||
  mongoose.model<ISubscriptionOrder>('SubscriptionOrder', SubscriptionOrderSchema, 'paypalorders');
