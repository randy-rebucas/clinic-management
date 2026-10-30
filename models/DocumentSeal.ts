import mongoose, { Schema, Document, Types } from 'mongoose';

export type SealDocumentType =
  | 'prescription'
  | 'medical_certificate'
  | 'lab_request'
  | 'lab_request_form'
  | 'referral_letter'
  | 'medical_records'
  | 'clinical_abstract'
  | 'receipt';

export type SealCopyType = 'original' | 'patient' | 'clinic';

/**
 * One record per printed/rendered copy of an official document.
 * The serial is printed on the paper (and encoded in its QR code) so third
 * parties (pharmacies, insurers, HMOs, employers) can confirm the copy is
 * genuine and unaltered at /verify/<serial>.
 */
export interface IDocumentSeal extends Document {
  tenantId?: Types.ObjectId;
  serial: string; // normalized 16-char Crockford base32, unguessable (80 bits)
  documentType: SealDocumentType;
  documentId: Types.ObjectId;
  documentCode?: string;
  copyType: SealCopyType;
  printNumber: number; // 1 = first copy issued for this document
  contentHash: string; // sha256 of the canonical document content at issue time
  signature: string; // HMAC-SHA256 over the seal fields
  issuedAt: Date;
  issuedBy?: Types.ObjectId;
  issuedByName?: string;
  ipAddress?: string;
  userAgent?: string;
  verificationCount: number;
  lastVerifiedAt?: Date;
  revokedAt?: Date;
  revokedBy?: Types.ObjectId;
  revokedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSealSchema = new Schema<IDocumentSeal>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    serial: { type: String, required: true },
    documentType: {
      type: String,
      enum: ['prescription', 'medical_certificate', 'lab_request', 'lab_request_form', 'referral_letter', 'medical_records', 'clinical_abstract', 'receipt'],
      required: true,
    },
    documentId: { type: Schema.Types.ObjectId, required: true },
    documentCode: { type: String },
    copyType: { type: String, enum: ['original', 'patient', 'clinic'], default: 'original' },
    printNumber: { type: Number, required: true, default: 1 },
    contentHash: { type: String, required: true },
    signature: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    issuedByName: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String },
    verificationCount: { type: Number, default: 0 },
    lastVerifiedAt: { type: Date },
    revokedAt: { type: Date },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    revokedReason: { type: String },
  },
  { timestamps: true }
);

// Serial is globally unique — verification works without knowing the tenant
DocumentSealSchema.index({ serial: 1 }, { unique: true });
// Print history for a document
DocumentSealSchema.index({ tenantId: 1, documentType: 1, documentId: 1, issuedAt: -1 });

export default mongoose.models.DocumentSeal ||
  mongoose.model<IDocumentSeal>('DocumentSeal', DocumentSealSchema);
