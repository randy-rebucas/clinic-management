import mongoose, { Schema, Document, Types } from 'mongoose';

export type PaypalOrderStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface IPaypalOrder extends Document {
  orderId: string;
  tenantId: Types.ObjectId;
  plan: string;
  billingCycle: 'monthly' | 'yearly';
  amount: number;
  currency: string;
  status: PaypalOrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

const PaypalOrderSchema = new Schema<IPaypalOrder>(
  {
    orderId:      { type: String, required: true, unique: true },
    tenantId:     { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    plan:         { type: String, required: true },
    billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true },
    amount:       { type: Number, required: true },
    currency:     { type: String, default: 'USD' },
    status:       { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
  },
  { timestamps: true }
);

// Auto-expire abandoned pending orders after 2 hours
PaypalOrderSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7200, partialFilterExpression: { status: 'pending' } });

export default mongoose.models.PaypalOrder ||
  mongoose.model<IPaypalOrder>('PaypalOrder', PaypalOrderSchema);
