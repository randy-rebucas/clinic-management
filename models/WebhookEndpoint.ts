import mongoose, { Schema, Document, Types } from 'mongoose';

export const WEBHOOK_EVENTS = [
  'patient.created',
  'appointment.created',
  'appointment.status_changed',
  'invoice.paid',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** A URL a clinic asked us to POST events to. The signing secret is stored encrypted. */
export interface IWebhookEndpoint extends Document {
  tenantId: Types.ObjectId;
  url: string;
  description?: string;
  events: WebhookEvent[];
  secretEnc: string;
  enabled: boolean;
  /** Failed deliveries in a row; the endpoint is switched off at DISABLE_AFTER_FAILURES. */
  consecutiveFailures: number;
  disabledReason?: string;
  createdBy?: Types.ObjectId;
  createdByEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookEndpointSchema = new Schema<IWebhookEndpoint>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    url: { type: String, required: true, maxlength: 2048 },
    description: { type: String, trim: true, maxlength: 200 },
    events: { type: [String], enum: WEBHOOK_EVENTS, default: [] },
    secretEnc: { type: String, required: true, select: false },
    enabled: { type: Boolean, default: true },
    consecutiveFailures: { type: Number, default: 0 },
    disabledReason: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByEmail: { type: String },
  },
  { timestamps: true }
);

WebhookEndpointSchema.index({ tenantId: 1, enabled: 1, events: 1 });

export default mongoose.models.WebhookEndpoint ||
  mongoose.model<IWebhookEndpoint>('WebhookEndpoint', WebhookEndpointSchema);
