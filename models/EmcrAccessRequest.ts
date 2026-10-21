import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Requests eMCR hands to a clinic's staff:
 * - `access`: someone filled in the "Request access" form and no record at that clinic matched
 *   (or the record has no phone/email to send a link to). Staff check the person, fix the
 *   record's contact details, and send the sign-in link.
 * - `adult_profile`: an eMCR account holder asked to manage an adult's records (e.g. an elderly
 *   parent). Staff confirm consent in person before approving.
 */
export type EmcrRequestKind = 'access' | 'adult_profile';
export type EmcrRequestStatus = 'pending' | 'approved' | 'rejected';

export interface IEmcrAccessRequest extends Document {
  kind: EmcrRequestKind;
  tenantId: Types.ObjectId;
  /** The matched record (adult_profile always; access when found but unreachable). */
  patientId?: Types.ObjectId;
  /** adult_profile: the account asking. */
  accountId?: Types.ObjectId;
  relationship?: string;
  /** What the requester typed (access form). Never used as a delivery address. */
  firstName: string;
  lastName?: string;
  dateOfBirth?: Date;
  contactPhone?: string;
  contactEmail?: string;
  status: EmcrRequestStatus;
  decidedBy?: Types.ObjectId;
  decidedAt?: Date;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmcrAccessRequestSchema = new Schema<IEmcrAccessRequest>(
  {
    kind: { type: String, enum: ['access', 'adult_profile'], required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient' },
    accountId: { type: Schema.Types.ObjectId, ref: 'EmcrAccount' },
    relationship: { type: String, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true },
    dateOfBirth: { type: Date },
    contactPhone: { type: String, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

EmcrAccessRequestSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
EmcrAccessRequestSchema.index({ accountId: 1, status: 1 });

export default mongoose.models.EmcrAccessRequest ||
  mongoose.model<IEmcrAccessRequest>('EmcrAccessRequest', EmcrAccessRequestSchema);
