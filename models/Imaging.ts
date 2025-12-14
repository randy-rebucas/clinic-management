import mongoose, { Schema, Document, Types } from 'mongoose';
import { AttachmentSchema, IAttachment } from './Attachment';

export interface IImaging extends Document {
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;
  
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
    // Tenant reference for multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    
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

// Indexes for efficient queries (tenant-scoped)
ImagingSchema.index({ tenantId: 1, patient: 1, orderDate: -1 });
ImagingSchema.index({ tenantId: 1, visit: 1 });
ImagingSchema.index({ tenantId: 1, orderedBy: 1 });
ImagingSchema.index({ tenantId: 1, reportedBy: 1 });
ImagingSchema.index({ tenantId: 1, status: 1 });
ImagingSchema.index({ tenantId: 1, orderedBy: 1, orderDate: -1 }); // For orderer history
ImagingSchema.index({ tenantId: 1, status: 1, orderDate: -1 }); // For status-based date queries
ImagingSchema.index({ tenantId: 1, patient: 1, status: 1 }); // For patient's pending imaging
ImagingSchema.index({ tenantId: 1, modality: 1 }); // For modality-based queries

export default mongoose.models.Imaging || mongoose.model<IImaging>('Imaging', ImagingSchema);

