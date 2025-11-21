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
    
    // Digital Signature
    digitalSignature: {
      providerName: { type: String, required: true },
      providerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      signatureData: { type: String, required: true }, // Base64 encoded
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

VisitSchema.index({ patient: 1, date: -1 });
VisitSchema.index({ provider: 1 });

export default mongoose.models.Visit || mongoose.model<IVisit>('Visit', VisitSchema);

