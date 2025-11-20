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
  assessment?: string; // clinical impression
  plan?: string; // management plan text
  prescriptions: Types.ObjectId[];
  labsOrdered: Types.ObjectId[];
  imagingOrdered: Types.ObjectId[];
  proceduresPerformed: Types.ObjectId[];
  attachments: IAttachment[];
  notes?: string;
  followUpDate?: Date;
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
    assessment: { type: String }, // clinical impression
    plan: { type: String }, // management plan text
    prescriptions: [{ type: Schema.Types.ObjectId, ref: 'Prescription' }],
    labsOrdered: [{ type: Schema.Types.ObjectId, ref: 'LabResult' }],
    imagingOrdered: [{ type: Schema.Types.ObjectId, ref: 'Imaging' }],
    proceduresPerformed: [{ type: Schema.Types.ObjectId, ref: 'Procedure' }],
    attachments: [AttachmentSchema],
    notes: { type: String },
    followUpDate: { type: Date },
    status: { type: String, enum: ['open', 'closed', 'cancelled'], default: 'open' },
  },
  { timestamps: true }
);

VisitSchema.index({ patient: 1, date: -1 });

export default mongoose.models.Visit || mongoose.model<IVisit>('Visit', VisitSchema);

