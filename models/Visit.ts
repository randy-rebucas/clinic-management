import mongoose, { Schema, Document, Types } from 'mongoose';
import { AttachmentSchema, IAttachment } from './Attachment';

export interface IVital {
  bp?: string; // e.g. "120/80"
  hr?: number;
  rr?: number;
  tempC?: number;
  spo2?: number;
  heightCm?: number;
  weightKg?: number;
  bmi?: number;
}

export interface IPhysicalExam {
  general?: string;
  heent?: string;
  chest?: string;
  cardiovascular?: string;
  abdomen?: string;
  neuro?: string;
  skin?: string;
  other?: string;
}

export interface ISOAPNotes {
  // Subjective - patient's description of symptoms
  subjective?: string;
  
  // Objective - measurable observations (vitals, physical exam)
  objective?: string;
  
  // Assessment - clinical impression/diagnosis
  assessment?: string;
  
  // Plan - treatment plan
  plan?: string;
}

export interface ITreatmentPlan {
  medications?: Array<{
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    quantity?: number;
    instructions?: string;
  }>;
  procedures?: Array<{
    name: string;
    description?: string;
    scheduledDate?: Date;
  }>;
  lifestyle?: Array<{
    category: string; // diet, exercise, etc.
    instructions: string;
  }>;
  followUp?: {
    date?: Date;
    instructions?: string;
    reminderSent?: boolean;
  };
}

export interface IDigitalSignature {
  providerName: string;
  providerId: Types.ObjectId;
  signatureData: string; // Base64 encoded signature image
  signedAt: Date;
  ipAddress?: string;
}

export interface IVisit extends Document {
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;
  
  patient: Types.ObjectId;
  visitCode: string;
  date: Date;
  provider?: Types.ObjectId;
  visitType: 'consultation' | 'follow-up' | 'checkup' | 'emergency' | 'teleconsult';
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  vitals?: IVital;
  physicalExam?: IPhysicalExam;
  diagnoses: Array<{
    code?: string; // ICD-10 code recommended
    description?: string;
    primary?: boolean;
  }>;
  assessment?: string; // clinical impression (legacy, use SOAP.assessment)
  plan?: string; // management plan text (legacy, use SOAP.plan)
  
  // SOAP Notes structure
  soapNotes?: ISOAPNotes;
  
  // Treatment Plan
  treatmentPlan?: ITreatmentPlan;
  
  // Digital Signature
  digitalSignature?: IDigitalSignature;
  
  prescriptions: Types.ObjectId[];
  labsOrdered: Types.ObjectId[];
  imagingOrdered: Types.ObjectId[];
  proceduresPerformed: Types.ObjectId[];
  attachments: IAttachment[];
  notes?: string;
  followUpDate?: Date;
  followUpReminderSent?: boolean;
  status: 'open' | 'closed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

const VitalSchema: Schema = new Schema(
  {
    bp: String, // e.g. "120/80"
    hr: Number,
    rr: Number,
    tempC: Number,
    spo2: Number,
    heightCm: Number,
    weightKg: Number,
    bmi: Number,
  },
  { _id: false }
);

const PhysicalExamSchema: Schema = new Schema(
  {
    general: String,
    heent: String,
    chest: String,
    cardiovascular: String,
    abdomen: String,
    neuro: String,
    skin: String,
    other: String,
  },
  { _id: false }
);

const VisitSchema: Schema = new Schema(
  {
    // Tenant reference for multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    visitCode: { type: String, required: true }, // clinic-specific code
    date: { type: Date, default: Date.now, index: true },
    provider: { type: Schema.Types.ObjectId, ref: 'User' },
    visitType: { type: String, enum: ['consultation', 'follow-up', 'checkup', 'emergency', 'teleconsult'], default: 'consultation' },
    chiefComplaint: { type: String },
    historyOfPresentIllness: { type: String },
    vitals: VitalSchema,
    physicalExam: PhysicalExamSchema,
    diagnoses: [
      {
        code: String, // ICD-10 code recommended
        description: String,
        primary: { type: Boolean, default: false },
      },
    ],
    assessment: { type: String }, // clinical impression (legacy)
    plan: { type: String }, // management plan text (legacy)
    
    // SOAP Notes
    soapNotes: {
      subjective: { type: String },
      objective: { type: String },
      assessment: { type: String },
      plan: { type: String },
    },
    
    // Treatment Plan
    treatmentPlan: {
      medications: [{
        name: { type: String, required: true },
        dosage: { type: String },
        frequency: { type: String },
        duration: { type: String },
        quantity: { type: Number },
        instructions: { type: String },
      }],
      procedures: [{
        name: { type: String, required: true },
        description: { type: String },
        scheduledDate: { type: Date },
      }],
      lifestyle: [{
        category: { type: String },
        instructions: { type: String },
      }],
      followUp: {
        date: { type: Date },
        instructions: { type: String },
        reminderSent: { type: Boolean, default: false },
      },
    },
    
    // Digital Signature (optional, but if provided, all fields are required)
    digitalSignature: {
      providerName: { type: String },
      providerId: { type: Schema.Types.ObjectId, ref: 'User' },
      signatureData: { type: String }, // Base64 encoded
      signedAt: { type: Date, default: Date.now },
      ipAddress: { type: String },
    },
    
    prescriptions: [{ type: Schema.Types.ObjectId, ref: 'Prescription' }],
    labsOrdered: [{ type: Schema.Types.ObjectId, ref: 'LabResult' }],
    imagingOrdered: [{ type: Schema.Types.ObjectId, ref: 'Imaging' }],
    proceduresPerformed: [{ type: Schema.Types.ObjectId, ref: 'Procedure' }],
    attachments: [AttachmentSchema],
    notes: { type: String },
    followUpDate: { type: Date },
    followUpReminderSent: { type: Boolean, default: false },
    status: { type: String, enum: ['open', 'closed', 'cancelled'], default: 'open' },
  },
  { timestamps: true }
);

VisitSchema.index({ tenantId: 1, patient: 1, date: -1 });
VisitSchema.index({ tenantId: 1, provider: 1 });
VisitSchema.index({ tenantId: 1, provider: 1, date: -1 }); // Tenant-scoped provider visit history
VisitSchema.index({ tenantId: 1, status: 1, date: -1 }); // Tenant-scoped status queries
VisitSchema.index({ tenantId: 1, visitCode: 1 }); // Tenant-scoped visit code lookups
VisitSchema.index({ tenantId: 1, visitType: 1, date: -1 }); // Tenant-scoped visit type queries
VisitSchema.index({ tenantId: 1, date: 1, status: 1 }); // Tenant-scoped date range + status queries
VisitSchema.index({ tenantId: 1, patient: 1, status: 1 }); // Tenant-scoped patient visits by status

// Pre-validate hook: if digitalSignature is provided (has any field), all required fields must be present
VisitSchema.pre('validate', function(next) {
  const sig = this.digitalSignature as any;
  // Only validate if digitalSignature exists, is an object, and has at least one of the REQUIRED fields
  // Skip validation if it's undefined, null, or doesn't have any required fields
  if (sig != null && typeof sig === 'object' && !Array.isArray(sig)) {
    // Check if object has any of the REQUIRED fields (not optional ones like signedAt or ipAddress)
    const hasProviderName = sig.providerName && String(sig.providerName).trim().length > 0;
    const hasProviderId = sig.providerId != null;
    const hasSignatureData = sig.signatureData && String(sig.signatureData).trim().length > 0;
    const hasAnyRequiredField = hasProviderName || hasProviderId || hasSignatureData;
    
    // If it doesn't have any required fields, delete it to avoid validation issues
    // (signedAt has a default, so it might exist even if the object wasn't intentionally set)
    if (!hasAnyRequiredField) {
      this.digitalSignature = undefined;
    } else {
      // Object has at least one required field, so validate all required fields are present
      if (!hasProviderName) {
        this.invalidate('digitalSignature.providerName', 'Provider name is required when digital signature is provided');
      }
      if (!hasProviderId) {
        this.invalidate('digitalSignature.providerId', 'Provider ID is required when digital signature is provided');
      }
      if (!hasSignatureData) {
        this.invalidate('digitalSignature.signatureData', 'Signature data is required when digital signature is provided');
      }
    }
  }
  next();
});

export default mongoose.models.Visit || mongoose.model<IVisit>('Visit', VisitSchema);

