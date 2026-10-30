import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Tracks mobile app installs for push delivery (Expo push token, which abstracts FCM/APNs)
 * and per-device sign-out. A device belongs to either a patient (`patientId`) or a staff
 * user signed in to the app — today only medical representatives (`userId`).
 *
 * Distinct from PushSubscription, which stores browser web-push (VAPID)
 * subscriptions for staff users — different payload shape, different channel.
 */
/** Push categories a patient can mute on one device. A missing or true value means "send". */
export const PUSH_CATEGORIES = [
  'appointments',
  'labResults',
  'queue',
  'messages',
  'billing',
  'prescriptions',
  'followUps',
] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];

export interface IMobileDevice extends Document {
  patientId?: Types.ObjectId;
  userId?: Types.ObjectId;
  tenantId?: Types.ObjectId;
  deviceId: string;
  pushToken?: string;
  platform: 'ios' | 'android';
  appVersion?: string;
  pushPrefs?: Partial<Record<PushCategory, boolean>>;
  lastSeenAt: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MobileDeviceSchema = new Schema<IMobileDevice>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
    deviceId: { type: String, required: true },
    pushToken: { type: String },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    appVersion: { type: String },
    pushPrefs: {
      appointments: { type: Boolean },
      labResults: { type: Boolean },
      queue: { type: Boolean },
      messages: { type: Boolean },
      billing: { type: Boolean },
      prescriptions: { type: Boolean },
      followUps: { type: Boolean },
    },
    lastSeenAt: { type: Date, default: Date.now },
    revokedAt: { type: Date },
  },
  { timestamps: true }
);

MobileDeviceSchema.pre('validate', function () {
  if (!this.patientId === !this.userId) {
    this.invalidate('patientId', 'A device belongs to exactly one patient or one user.');
  }
});

// One device record per patient+device — re-registering updates it in place.
// (User-owned rows have no patientId; the rep devices route removes any other user's row for
// the same deviceId first, so this index never sees two rows with a null patientId and one deviceId.)
MobileDeviceSchema.index({ patientId: 1, deviceId: 1 }, { unique: true });
MobileDeviceSchema.index(
  { userId: 1, deviceId: 1 },
  { unique: true, partialFilterExpression: { userId: { $exists: true } } }
);

export default mongoose.models.MobileDevice ||
  mongoose.model<IMobileDevice>('MobileDevice', MobileDeviceSchema);
