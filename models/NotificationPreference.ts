import mongoose, { Schema, Document, Types } from 'mongoose';

/** When a staff member doesn't want pushes. Rules are in lib/notification-policy.ts. */
export interface INotificationPreference extends Document {
  userId: Types.ObjectId;
  pausedUntil?: Date | null;
  quietHours?: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const NotificationPreferenceSchema = new Schema<INotificationPreference>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pausedUntil: { type: Date, default: null },
    quietHours: {
      enabled: { type: Boolean, default: false },
      start: { type: String, default: '22:00' },
      end: { type: String, default: '07:00' },
      timezone: { type: String, default: 'Asia/Manila' },
    },
  },
  { timestamps: true }
);

NotificationPreferenceSchema.index({ userId: 1 }, { unique: true });

export default mongoose.models.NotificationPreference ||
  mongoose.model<INotificationPreference>('NotificationPreference', NotificationPreferenceSchema);
