import mongoose, { Schema, Document, Types } from 'mongoose';

export type DocumentCategory = 
  | 'referral' 
  | 'laboratory_result' 
  | 'imaging' 
  | 'medical_certificate' 
  | 'prescription' 
  | 'invoice' 
  | 'id' 
  | 'insurance' 
  | 'other';

export type DocumentType = 'pdf' | 'image' | 'word' | 'excel' | 'other';

export interface IDocument extends Document {
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;
  
  // Document identification
  documentCode: string; // Unique document identifier
  title: string;
  description?: string;
  category: DocumentCategory;
  documentType: DocumentType;
  
  // File information
  filename: string;
  originalFilename: string;
  contentType: string;
  size: number; // bytes
  url: string; // Base64 data URL or external URL (S3, CDN)
  thumbnailUrl?: string; // For images/PDFs
  
  // Relationships
  patient?: Types.ObjectId; // Associated patient
  visit?: Types.ObjectId; // Associated visit
  appointment?: Types.ObjectId; // Associated appointment
  labResult?: Types.ObjectId; // Associated lab result
  invoice?: Types.ObjectId; // Associated invoice
  
  // Metadata
  tags?: string[]; // For search and filtering
  scanned?: boolean; // Whether document was scanned
  ocrText?: string; // OCR extracted text (for scanned documents)
  expiryDate?: Date; // For documents with expiry (e.g., medical certificates)
  metadata?: { [key: string]: any }; // Additional metadata (e.g., cloudinaryPublicId)
  
  // Referral specific
  referral?: {
    referringDoctor?: string;
    referringClinic?: string;
    referralDate?: Date;
    reason?: string;
  };
  
  // Imaging specific
  imaging?: {
    modality?: string; // X-ray, CT, MRI, Ultrasound, etc.
    bodyPart?: string;
    studyDate?: Date;
    radiologist?: string;
  };
  
  // Medical certificate specific
  medicalCertificate?: {
    issueDate: Date;
    validUntil?: Date;
    purpose?: string; // Work, School, Travel, etc.
    restrictions?: string;
  };
  
  // Laboratory result document specific metadata
  labResultMetadata?: {
    testType?: string;
    testDate?: Date;
    labName?: string;
  };
  
  // Access control
  uploadedBy: Types.ObjectId;
  uploadDate: Date;
  lastModifiedBy?: Types.ObjectId;
  lastModifiedDate?: Date;
  
  // Status
  status: 'active' | 'archived' | 'deleted';
  isConfidential?: boolean; // Mark as confidential
  
  // Notes
  notes?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const ReferralSchema: Schema = new Schema(
  {
    referringDoctor: { type: String, trim: true },
    referringClinic: { type: String, trim: true },
    referralDate: { type: Date },
    reason: { type: String },
  },
  { _id: false }
);

const ImagingSchema: Schema = new Schema(
  {
    modality: { type: String, trim: true }, // X-ray, CT, MRI, Ultrasound, etc.
    bodyPart: { type: String, trim: true },
    studyDate: { type: Date },
    radiologist: { type: String, trim: true },
  },
  { _id: false }
);

const MedicalCertificateSchema: Schema = new Schema(
  {
    issueDate: { type: Date, required: true },
    validUntil: { type: Date },
    purpose: { type: String, trim: true },
    restrictions: { type: String },
  },
  { _id: false }
);

const LabResultMetadataSchema: Schema = new Schema(
  {
    testType: { type: String, trim: true },
    testDate: { type: Date },
    labName: { type: String, trim: true },
  },
  { _id: false }
);

const DocumentSchema: Schema = new Schema(
  {
    // Tenant reference for multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    
    documentCode: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, index: true },
    description: { type: String, trim: true },
    category: {
      type: String,
      enum: ['referral', 'laboratory_result', 'imaging', 'medical_certificate', 'prescription', 'invoice', 'id', 'insurance', 'other'],
      required: true,
      index: true,
    },
    documentType: {
      type: String,
      enum: ['pdf', 'image', 'word', 'excel', 'other'],
      required: true,
      index: true,
    },
    filename: { type: String, required: true },
    originalFilename: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    url: { type: String, required: true },
    thumbnailUrl: { type: String },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', index: true },
    visit: { type: Schema.Types.ObjectId, ref: 'Visit', index: true },
    appointment: { type: Schema.Types.ObjectId, ref: 'Appointment', index: true },
    labResult: { type: Schema.Types.ObjectId, ref: 'LabResult', index: true },
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', index: true },
    tags: [{ type: String, trim: true }],
    scanned: { type: Boolean, default: false },
    ocrText: { type: String },
    expiryDate: { type: Date },
    metadata: { type: Schema.Types.Mixed }, // Additional metadata
    referral: ReferralSchema,
    imaging: ImagingSchema,
    medicalCertificate: MedicalCertificateSchema,
    labResultMetadata: LabResultMetadataSchema,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadDate: { type: Date, default: Date.now },
    lastModifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lastModifiedDate: { type: Date },
    status: {
      type: String,
      enum: ['active', 'archived', 'deleted'],
      default: 'active',
    },
    isConfidential: { type: Boolean, default: false },
    notes: { type: String },
  },
  { timestamps: true }
);

// Indexes for efficient queries (tenant-scoped)
DocumentSchema.index({ tenantId: 1, patient: 1, category: 1, status: 1 });
DocumentSchema.index({ tenantId: 1, category: 1, status: 1 });
DocumentSchema.index({ tenantId: 1, tags: 1 });
DocumentSchema.index({ tenantId: 1, title: 'text', description: 'text', ocrText: 'text' }); // Full-text search
DocumentSchema.index({ tenantId: 1, uploadDate: -1 });
DocumentSchema.index({ tenantId: 1, expiryDate: 1 });
DocumentSchema.index({ tenantId: 1, uploadedBy: 1 });
DocumentSchema.index({ tenantId: 1, uploadedBy: 1, uploadDate: -1 }); // For uploader history
DocumentSchema.index({ tenantId: 1, lastModifiedBy: 1 });
DocumentSchema.index({ tenantId: 1, visit: 1, category: 1 }); // For visit-related documents
DocumentSchema.index({ tenantId: 1, appointment: 1, category: 1 }); // For appointment-related documents
DocumentSchema.index({ tenantId: 1, documentCode: 1 }, { unique: true, sparse: true }); // Tenant-scoped document code

// Pre-save hook to generate document code
DocumentSchema.pre('save', async function (next) {
  if (!this.documentCode) {
    try {
      // Use the model directly from mongoose.models or this.constructor
      const DocumentModel = mongoose.models.Document || this.constructor;
      const count = await DocumentModel.countDocuments();
      // Generate unique code using timestamp and random string to avoid collisions
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      this.documentCode = `DOC-${Date.now()}-${randomSuffix}`;
    } catch (error) {
      // Fallback if countDocuments fails - use timestamp and random
      const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
      this.documentCode = `DOC-${Date.now()}-${randomSuffix}`;
    }
  }
  next();
});

export default mongoose.models.Document || mongoose.model<IDocument>('Document', DocumentSchema);

