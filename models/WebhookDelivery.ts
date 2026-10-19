import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * One event for one endpoint, with its retry state. Kept 30 days so clinics can see what
 * was sent and re-send it.
 */
export interface IWebhookDelivery extends Document {
  tenantId: Types.ObjectId;
  endpointId: Types.ObjectId;
  eventId: string;
  event: string;
  /** The exact JSON body sent (and re-sent), so the signature always covers the same bytes. */
  body: string;
  status: 'pending' | 'succeeded' | 'failed';
  attempts: number;
  nextAttemptAt?: Date;
  lastAttemptAt?: Date;
  responseStatus?: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookDeliverySchema = new Schema<IWebhookDelivery>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    endpointId: { type: Schema.Types.ObjectId, ref: 'WebhookEndpoint', required: true },
    eventId: { type: String, required: true },
    event: { type: String, required: true },
    body: { type: String, required: true },
    status: { type: String, enum: ['pending', 'succeeded', 'failed'], default: 'pending' },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date },
    lastAttemptAt: { type: Date },
    responseStatus: { type: Number },
    error: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

WebhookDeliverySchema.index({ status: 1, nextAttemptAt: 1 });
WebhookDeliverySchema.index({ tenantId: 1, endpointId: 1, createdAt: -1 });
WebhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.models.WebhookDelivery ||
  mongoose.model<IWebhookDelivery>('WebhookDelivery', WebhookDeliverySchema);
