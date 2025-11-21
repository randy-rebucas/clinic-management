import mongoose, { Schema, Document, Types } from 'mongoose';
import { AttachmentSchema, IAttachment } from './Attachment';

export interface ILabRequest {
  testType: string; // e.g. "CBC", "Urinalysis"
  testCode?: string; // Standard test code (e.g., LOINC code)
  description?: string;
  urgency?: 'routine' | 'urgent' | 'stat';
  specialInstructions?: string;
  fastingRequired?: boolean;
  preparationNotes?: string;
}

export interface IThirdPartyLab {
  labName: string;
  labId?: string; // External lab identifier
  labCode?: string; // Lab facility code
  integrationType?: 'manual' | 'api' | 'hl7' | 'other';
  apiEndpoint?: string;
  apiKey?: string;
  externalRequestId?: string; // Reference ID from third-party lab
  externalResultId?: string; // Result ID from third-party lab
  status?: 'pending' | 'sent' | 'received' | 'error';
  sentAt?: Date;
  receivedAt?: Date;
  errorMessage?: string;
}

export interface ILabResult extends Document {
  visit?: Types.ObjectId;
  patient: Types.ObjectId;
  orderedBy?: Types.ObjectId;
  orderDate: Date;
  requestCode?: string; // Unique request identifier
  // Request information
  request: ILabRequest;
  // Third-party lab integration
  thirdPartyLab?: IThirdPartyLab;
  // Results
  results?: any; // structured object, e.g. { hb: 13.2, wbc: 6.5 }
  resultDate?: Date; // When results were received
  interpretation?: string;
  referenceRanges?: any; // e.g. { hb: "12-16 g/dL" }
  abnormalFlags?: Record<string, 'high' | 'low' | 'normal'>; // Flag abnormal values
  status: 'ordered' | 'in-progress' | 'completed' | 'reviewed' | 'cancelled';
  attachments: IAttachment[];
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  // Patient notification
  notificationSent?: boolean;
  notificationSentAt?: Date;
  notificationMethod?: 'email' | 'sms' | 'both';
  createdAt: Date;
  updatedAt: Date;
}

const LabRequestSchema: Schema = new Schema(
  {
    testType: { type: String, required: true },
    testCode: String,
    description: String,
    urgency: {
      type: String,
      enum: ['routine', 'urgent', 'stat'],
      default: 'routine',
    },
    specialInstructions: String,
    fastingRequired: { type: Boolean, default: false },
    preparationNotes: String,
  },
  { _id: false }
);

const ThirdPartyLabSchema: Schema = new Schema(
  {
    labName: { type: String, required: true },
    labId: String,
    labCode: String,
    integrationType: {
      type: String,
      enum: ['manual', 'api', 'hl7', 'other'],
      default: 'manual',
    },
    apiEndpoint: String,
    apiKey: String, // Encrypted in production
    externalRequestId: String,
    externalResultId: String,
    status: {
      type: String,
      enum: ['pending', 'sent', 'received', 'error'],
      default: 'pending',
    },
    sentAt: Date,
    receivedAt: Date,
    errorMessage: String,
  },
  { _id: false }
);

const LabResultSchema: Schema = new Schema(
  {
    visit: { type: Schema.Types.ObjectId, ref: 'Visit', index: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    orderedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    orderDate: { type: Date, default: Date.now },
    requestCode: { type: String, unique: true, sparse: true, index: true },
    request: { type: LabRequestSchema, required: true },
    thirdPartyLab: ThirdPartyLabSchema,
    results: { type: Schema.Types.Mixed },
    resultDate: Date,
    interpretation: String,
    referenceRanges: { type: Schema.Types.Mixed },
    abnormalFlags: { type: Map, of: String },
    status: {
      type: String,
      enum: ['ordered', 'in-progress', 'completed', 'reviewed', 'cancelled'],
      default: 'ordered',
      index: true,
    },
    attachments: [AttachmentSchema],
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    notificationSent: { type: Boolean, default: false },
    notificationSentAt: Date,
    notificationMethod: {
      type: String,
      enum: ['email', 'sms', 'both'],
    },
  },
  { timestamps: true }
);

// Indexes for efficient queries
LabResultSchema.index({ patient: 1, orderDate: -1 });
LabResultSchema.index({ visit: 1 });
LabResultSchema.index({ orderedBy: 1 });
LabResultSchema.index({ reviewedBy: 1 });
LabResultSchema.index({ status: 1 });

export default mongoose.models.LabResult || mongoose.model<ILabResult>('LabResult', LabResultSchema);

