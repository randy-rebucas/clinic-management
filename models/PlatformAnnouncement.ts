import mongoose, { Schema, Document, Types } from 'mongoose';

/** A notification the platform team sent to clinics: the console's record of what went out. */
export interface IPlatformAnnouncement extends Document {
  title: string;
  message: string;
  priority: 'normal' | 'high' | 'urgent';
  audience: 'admins' | 'all-staff';
  /** Empty = every active clinic. */
  tenantIds: Types.ObjectId[];
  actionUrl?: string;
  sentByEmail: string;
  clinics: number;
  recipients: number;
  createdAt: Date;
}

const PlatformAnnouncementSchema = new Schema<IPlatformAnnouncement>(
  {
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 2000 },
    priority: { type: String, enum: ['normal', 'high', 'urgent'], default: 'normal' },
    audience: { type: String, enum: ['admins', 'all-staff'], required: true },
    tenantIds: { type: [Schema.Types.ObjectId], ref: 'Tenant', default: [] },
    actionUrl: { type: String, maxlength: 500 },
    sentByEmail: { type: String, required: true },
    clinics: { type: Number, default: 0 },
    recipients: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PlatformAnnouncementSchema.index({ createdAt: -1 });

export default mongoose.models.PlatformAnnouncement ||
  mongoose.model<IPlatformAnnouncement>('PlatformAnnouncement', PlatformAnnouncementSchema);
