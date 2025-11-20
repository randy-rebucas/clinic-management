import mongoose, { Schema, Document, Types } from 'mongoose';
import { AttachmentSchema, IAttachment } from './Attachment';

export interface IImaging extends Document {
  visit?: Types.ObjectId;
  patient: Types.ObjectId;
  orderedBy?: Types.ObjectId;
  modality?: string; // X-ray, Ultrasound, CT, MRI
  bodyPart?: string;
  orderDate: Date;
  findings?: string;
  impression?: string;
  images: IAttachment[]; // store image metadata or urls
  status: 'ordered' | 'completed' | 'reported' | 'cancelled';
  reportedBy?: Types.ObjectId;
  reportedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ImagingSchema: Schema = new Schema(
  {
    visit: { type: Schema.Types.ObjectId, ref: 'Visit' },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    orderedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    modality: { type: String }, // X-ray, Ultrasound, CT, MRI
    bodyPart: { type: String },
    orderDate: { type: Date, default: Date.now },
    findings: { type: String },
    impression: { type: String },
    images: [AttachmentSchema], // store image metadata or urls
    status: { type: String, enum: ['ordered', 'completed', 'reported', 'cancelled'], default: 'ordered' },
    reportedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reportedAt: Date,
  },
  { timestamps: true }
);

// Indexes for efficient queries
ImagingSchema.index({ patient: 1, orderDate: -1 });
ImagingSchema.index({ visit: 1 });
ImagingSchema.index({ orderedBy: 1 });
ImagingSchema.index({ status: 1 });

export default mongoose.models.Imaging || mongoose.model<IImaging>('Imaging', ImagingSchema);

