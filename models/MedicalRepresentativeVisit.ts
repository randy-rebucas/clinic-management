import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMedicalRepresentativeVisit extends Document {
  tenantId?: Types.ObjectId;
  userId: Types.ObjectId;
  medicalRepresentativeId?: Types.ObjectId;
  clinicName: string;
  clinicLocation: string;
  purpose: string;
  date: Date;
  time: string;
  duration: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MedicalRepresentativeVisitSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    medicalRepresentativeId: {
      type: Schema.Types.ObjectId,
      ref: 'MedicalRepresentative',
      index: true,
    },
    clinicName: { type: String, required: true, index: true },
    clinicLocation: { type: String, required: true },
    purpose: { type: String, required: true },
    date: { type: Date, required: true, index: true },
    time: { type: String, required: true },
    duration: { type: Number, default: 60 },
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
    notes: String,
  },
  { timestamps: true }
);

MedicalRepresentativeVisitSchema.index({ tenantId: 1, userId: 1, date: -1 });
MedicalRepresentativeVisitSchema.index({ tenantId: 1, clinicName: 'text', clinicLocation: 'text', purpose: 'text' });

export default mongoose.models.MedicalRepresentativeVisit ||
  mongoose.model<IMedicalRepresentativeVisit>('MedicalRepresentativeVisit', MedicalRepresentativeVisitSchema);
