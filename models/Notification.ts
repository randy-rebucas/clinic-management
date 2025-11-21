import mongoose, { Schema, Document, Types } from 'mongoose';

export type NotificationType = 
  | 'appointment' 
  | 'visit' 
  | 'prescription' 
  | 'lab_result' 
  | 'invoice' 
  | 'reminder' 
  | 'system' 
  | 'broadcast';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface INotification extends Document {
  user: Types.ObjectId; // User who should receive the notification
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  // Related entity references
  relatedEntity?: {
    type: 'appointment' | 'visit' | 'prescription' | 'lab_result' | 'invoice' | 'patient';
    id: Types.ObjectId;
  };
  // Action link (e.g., '/appointments/123')
  actionUrl?: string;
  // Read status
  read: boolean;
  readAt?: Date;
  // Additional metadata
  metadata?: {
    [key: string]: any;
  };
  // Expiration (optional)
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['appointment', 'visit', 'prescription', 'lab_result', 'invoice', 'reminder', 'system', 'broadcast'],
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
      index: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    relatedEntity: {
      type: {
        type: String,
        enum: ['appointment', 'visit', 'prescription', 'lab_result', 'invoice', 'patient'],
      },
      id: { type: Schema.Types.ObjectId },
    },
    actionUrl: { type: String },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
    expiresAt: { type: Date, index: true },
  },
  { timestamps: true }
);

// Indexes for efficient queries
NotificationSchema.index({ user: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, type: 1, read: 1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired notifications

export default mongoose.models.Notification || mongoose.model<INotification>('Notification', NotificationSchema);

