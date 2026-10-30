import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A patient's request, from the app, for a document the clinic issues on review:
 * - `medical_records`: a copy of their records at the clinic (Data Privacy Act right of access).
 *   It covers the requested period up to the moment of release (`cutoff`): anything recorded
 *   later needs a new request, so nothing reaches the patient that staff didn't release.
 * - `medical_certificate`: the medical certificate for one of their visits (`visit`). Its content
 *   is the visit's (diagnosis, recommendations), so staff fix the visit before releasing.
 * - `clinical_abstract`: a doctor's written summary of the patient's case (`abstract`), the form
 *   insurers, HMOs, employers and embassies usually ask for. A doctor writes it while the request
 *   is pending (prefilled from the chart) and it is signed by whoever last saved it (`abstractAuthor`).
 *
 * Staff release or decline it; a released document is a sealed PDF the patient downloads while
 * `availableUntil` lasts. Each clinic keeps its own record of the person, so a request is made on
 * that clinic's record.
 */
export const DOCUMENT_REQUEST_KINDS = ['medical_records', 'medical_certificate', 'clinical_abstract'] as const;
export type DocumentRequestKind = (typeof DOCUMENT_REQUEST_KINDS)[number];

export const DOCUMENT_REQUEST_PURPOSES = [
  'personal',
  'second_opinion',
  'sick_leave',
  'school',
  'fit_to_work',
  'insurance',
  'employment',
  'travel',
  'legal',
  'other',
] as const;
export type DocumentRequestPurpose = (typeof DOCUMENT_REQUEST_PURPOSES)[number];

/** The sections of a clinical abstract, in print order. */
export const CLINICAL_ABSTRACT_FIELDS = [
  'consultations',
  'chiefComplaint',
  'history',
  'findings',
  'diagnostics',
  'diagnosis',
  'management',
  'condition',
  'recommendations',
] as const;
export type ClinicalAbstractField = (typeof CLINICAL_ABSTRACT_FIELDS)[number];
export type ClinicalAbstract = Partial<Record<ClinicalAbstractField, string>>;

export type DocumentRequestStatus = 'pending' | 'released' | 'declined' | 'cancelled' | 'revoked';

export interface IDocumentRequest extends Document {
  tenantId: Types.ObjectId;
  patient: Types.ObjectId;
  kind: DocumentRequestKind;
  requestCode: string;
  purpose: DocumentRequestPurpose;
  purposeNote?: string;
  /** medical_certificate: the visit it certifies. */
  visit?: Types.ObjectId;
  /** medical_records: requested period, "yyyy-MM-dd" in the clinic's timezone. Missing = from the first / to the latest record. */
  periodFrom?: string;
  periodTo?: string;
  /** clinical_abstract: what the doctor wrote, and who last saved it (it carries their signature). */
  abstract?: ClinicalAbstract;
  abstractAuthor?: Types.ObjectId;
  abstractSavedAt?: Date;
  status: DocumentRequestStatus;
  decidedBy?: Types.ObjectId;
  decidedAt?: Date;
  /** Shown to the patient when declined or revoked. */
  decisionNote?: string;
  /** medical_records: released copies include records dated up to here (the release time). */
  cutoff?: Date;
  availableUntil?: Date;
  downloadCount: number;
  lastDownloadedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentRequestSchema = new Schema<IDocumentRequest>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    kind: { type: String, enum: DOCUMENT_REQUEST_KINDS, required: true },
    requestCode: { type: String, required: true },
    purpose: { type: String, enum: DOCUMENT_REQUEST_PURPOSES, required: true },
    purposeNote: { type: String, trim: true },
    visit: { type: Schema.Types.ObjectId, ref: 'Visit' },
    periodFrom: { type: String },
    periodTo: { type: String },
    abstract: new Schema(Object.fromEntries(CLINICAL_ABSTRACT_FIELDS.map((f) => [f, { type: String, trim: true }])), { _id: false }),
    abstractAuthor: { type: Schema.Types.ObjectId, ref: 'User' },
    abstractSavedAt: { type: Date },
    status: { type: String, enum: ['pending', 'released', 'declined', 'cancelled', 'revoked'], default: 'pending' },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    decisionNote: { type: String, trim: true },
    cutoff: { type: Date },
    availableUntil: { type: Date },
    downloadCount: { type: Number, default: 0 },
    lastDownloadedAt: { type: Date },
  },
  { timestamps: true }
);

DocumentRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
DocumentRequestSchema.index({ patient: 1, createdAt: -1 });
DocumentRequestSchema.index(
  { tenantId: 1, patient: 1, kind: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' }, name: 'uniq_pending_document_request' }
);

export default mongoose.models.DocumentRequest ||
  mongoose.model<IDocumentRequest>('DocumentRequest', DocumentRequestSchema);
