import mongoose, { Schema, Document, Types } from 'mongoose';
import type { TemplateKind, TemplateMedication, TemplateVisitContent } from '@/lib/clinical-templates';

/**
 * A doctor's reusable clinical content:
 *   - visit:        a whole-visit note (SOAP, exam, diagnoses, medicines, follow-up advice)
 *   - prescription: a saved set of medicines ("my usual for URTI")
 *   - phrase:       a text macro expanded from ".shortcut" in any note field
 *
 * Templates belong to the user who made them; `shared` makes one visible to the whole clinic
 * (still editable only by its owner or an administrator).
 */

export interface IClinicalTemplate extends Document {
  tenantId: Types.ObjectId;
  ownerId: Types.ObjectId;
  kind: TemplateKind;
  name: string;
  specialty?: string;
  shared: boolean;
  shortcut?: string;
  text?: string;
  visit?: TemplateVisitContent;
  medications?: TemplateMedication[];
  usageCount: number;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MedicationSchema = new Schema<TemplateMedication>(
  {
    name: { type: String, required: true, trim: true },
    genericName: { type: String, trim: true },
    form: { type: String, trim: true },
    strength: { type: String, trim: true },
    dosage: { type: String, trim: true },
    route: { type: String, trim: true },
    frequency: { type: String, trim: true },
    duration: { type: String, trim: true },
    quantity: { type: Number, min: 0 },
    instructions: { type: String, trim: true },
  },
  { _id: false }
);

const ClinicalTemplateSchema = new Schema<IClinicalTemplate>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['visit', 'prescription', 'phrase'], required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    specialty: { type: String, trim: true, maxlength: 80 },
    shared: { type: Boolean, default: false },
    shortcut: { type: String, trim: true, lowercase: true, maxlength: 20 },
    text: { type: String, maxlength: 4000 },
    visit: {
      chiefComplaint: String,
      historyOfPresentIllness: String,
      soapNotes: { subjective: String, objective: String, assessment: String, plan: String },
      physicalExam: { type: Map, of: String },
      diagnoses: [{ _id: false, code: String, description: String, primary: Boolean }],
      followUpInstructions: String,
    },
    medications: { type: [MedicationSchema], default: undefined },
    usageCount: { type: Number, default: 0 },
    lastUsedAt: Date,
  },
  { timestamps: true }
);

ClinicalTemplateSchema.index({ tenantId: 1, ownerId: 1, kind: 1 });
ClinicalTemplateSchema.index({ tenantId: 1, shared: 1, kind: 1 });
// A shortcut is unique among one user's phrases.
ClinicalTemplateSchema.index(
  { tenantId: 1, ownerId: 1, shortcut: 1 },
  { unique: true, partialFilterExpression: { kind: 'phrase', shortcut: { $type: 'string' } } }
);

export default (mongoose.models.ClinicalTemplate as mongoose.Model<IClinicalTemplate>) ||
  mongoose.model<IClinicalTemplate>('ClinicalTemplate', ClinicalTemplateSchema);
