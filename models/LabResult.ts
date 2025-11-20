import mongoose, { Schema, Document, Types } from 'mongoose';
import { AttachmentSchema, IAttachment } from './Attachment';

export interface ILabResult extends Document {
  visit?: Types.ObjectId;
  patient: Types.ObjectId;
  orderedBy?: Types.ObjectId;
  orderDate: Date;
  testType?: string; // e.g. "CBC", "Urinalysis"
  results?: any; // structured object, e.g. { hb: 13.2, wbc: 6.5 }
  interpretation?: string;
  referenceRanges?: any; // e.g. { hb: "12-16 g/dL" }
  status: 'ordered' | 'completed' | 'reviewed' | 'cancelled';
  attachments: IAttachment[];
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LabResultSchema: Schema = new Schema(
  {
    visit: { type: Schema.Types.ObjectId, ref: 'Visit', index: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    orderedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    orderDate: { type: Date, default: Date.now },
    testType: { type: String }, // e.g. "CBC", "Urinalysis"
    results: { type: Schema.Types.Mixed }, // structured object, e.g. { hb: 13.2, wbc: 6.5 }
    interpretation: { type: String },
    referenceRanges: { type: Schema.Types.Mixed }, // e.g. { hb: "12-16 g/dL" }
    status: { type: String, enum: ['ordered', 'completed', 'reviewed', 'cancelled'], default: 'ordered' },
    attachments: [AttachmentSchema], // scanned report
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
  },
  { timestamps: true }
);

// Indexes for efficient queries
LabResultSchema.index({ patient: 1, orderDate: -1 });
LabResultSchema.index({ visit: 1 });
LabResultSchema.index({ orderedBy: 1 });
LabResultSchema.index({ status: 1 });

export default mongoose.models.LabResult || mongoose.model<ILabResult>('LabResult', LabResultSchema);

