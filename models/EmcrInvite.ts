import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A clinic-issued invite to the eMCR app (lib/emcr/invite.ts): staff, who know the person at the
 * desk, hand over a one-time code (printed slip with a QR, and/or a text) instead of the patient
 * proving who they are with first name + birth date.
 *
 * - `self`: the invite is for the patient on `patientId`; it signs them in on their own record.
 * - `guardian`: for a parent or carer who manages `patientId` (and `dependentIds`, e.g. siblings)
 *   from their own eMCR login. Linked as a staff (`clinic`) link at this clinic.
 *
 * Redeeming always needs an SMS code to `phone`, the number staff confirmed, so a lost slip is
 * useless without that phone. Only the code's hash is kept.
 */
export type EmcrInviteMode = 'self' | 'guardian';
export type EmcrInviteChannel = 'print' | 'sms' | 'both';

export interface IEmcrInvite extends Document {
  codeHash: string;
  tenantId: Types.ObjectId;
  mode: EmcrInviteMode;
  patientId: Types.ObjectId;
  /** guardian: more records at this clinic the same person looks after. */
  dependentIds: Types.ObjectId[];
  /** guardian: how the invitee is related to the patients (FAMILY_RELATIONSHIPS). */
  relationship?: string;
  /** E.164. The sign-in code goes only here. */
  phone: string;
  channel: EmcrInviteChannel;
  issuedBy?: Types.ObjectId;
  expiresAt: Date;
  usedAt?: Date;
  usedByAccount?: Types.ObjectId;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EmcrInviteSchema = new Schema<IEmcrInvite>(
  {
    codeHash: { type: String, required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    mode: { type: String, enum: ['self', 'guardian'], required: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    dependentIds: { type: [Schema.Types.ObjectId], ref: 'Patient', default: [] },
    relationship: { type: String, trim: true },
    phone: { type: String, required: true, trim: true },
    channel: { type: String, enum: ['print', 'sms', 'both'], required: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
    usedByAccount: { type: Schema.Types.ObjectId, ref: 'EmcrAccount' },
    revokedAt: { type: Date },
  },
  { timestamps: true }
);

EmcrInviteSchema.index({ codeHash: 1 }, { unique: true });
EmcrInviteSchema.index({ tenantId: 1, patientId: 1, usedAt: 1, revokedAt: 1 });

export default mongoose.models.EmcrInvite || mongoose.model<IEmcrInvite>('EmcrInvite', EmcrInviteSchema);
