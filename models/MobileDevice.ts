import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Tracks patient mobile app installs for push delivery (Expo push token,
 * which abstracts FCM/APNs) and per-device Bearer token revocation.
 *
 * Distinct from PushSubscription, which stores browser web-push (VAPID)
 * subscriptions for staff users — different payload shape, different channel.
 */
export interface IMobileDevice extends Document {
  patientId: Types.ObjectId;
  tenantId?: Types.ObjectId;
  deviceId: string;
  pushToken?: string;
  platform: 'ios' | 'android';
  appVersion?: string;
  lastSeenAt: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MobileDeviceSchema = new Schema<IMobileDevice>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
    deviceId: { type: String, required: true },
    pushToken: { type: String },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    appVersion: { type: String },
    lastSeenAt: { type: Date, default: Date.now },
    revokedAt: { type: Date },
  },
  { timestamps: true }
);

// One device record per patient+device — re-registering updates it in place.
MobileDeviceSchema.index({ patientId: 1, deviceId: 1 }, { unique: true });

export default mongoose.models.MobileDevice ||
  mongoose.model<IMobileDevice>('MobileDevice', MobileDeviceSchema);
