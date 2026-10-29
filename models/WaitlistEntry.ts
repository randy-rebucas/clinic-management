import mongoose, { Schema } from 'mongoose';

// Persisted waitlist (an in-memory list was lost between serverless invocations).
// Used by lib/automations/waitlist-management.ts.
const WaitlistEntrySchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor' },
    preferredDate: { type: Date },
    preferredTime: { type: String, trim: true },
    priority: { type: Number, default: 0 },
    status: { type: String, enum: ['waiting', 'filled', 'removed'], default: 'waiting', index: true },
    filledAppointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    filledAt: { type: Date },
  },
  { timestamps: true }
);
WaitlistEntrySchema.index({ tenantId: 1, status: 1, priority: -1, createdAt: 1 });
WaitlistEntrySchema.index(
  { tenantId: 1, patient: 1 },
  { unique: true, partialFilterExpression: { status: 'waiting' }, name: 'uniq_waiting_patient' }
);

export default (mongoose.models.WaitlistEntry as mongoose.Model<any>) ||
  mongoose.model('WaitlistEntry', WaitlistEntrySchema);
