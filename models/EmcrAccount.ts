import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * An eMCR app account: one verified phone number. eMCR is run separately from the clinics; the
 * clinics' patient records are attached to the account as profiles once the caller proves who
 * they are (phone OTP, then first name + date of birth). See lib/emcr/account.ts.
 *
 * - `selfPatientId`: the holder's own record (any one of them; linked records share `accountId`).
 *   Absent for a parent who is not a patient anywhere (guardian-only account).
 * - `dependents`: records the holder manages without being a patient record themselves. When
 *   the holder has a self record, minors are linked on the child's record (`Patient.guardians`)
 *   instead, so the existing family rules apply.
 * - `activation`: the paid year of eMCR, bought with a cash voucher (lib/emcr/activation.ts).
 * - `password`: the sign-in credential with `phone` (lib/emcr/password.ts). None until the holder
 *   chooses one after proving the phone, or staff set a temporary one (`mustChangePassword`).
 */
export type EmcrDependentSource = 'phone_dob' | 'clinic';
export type EmcrPlan = 'basic' | 'plus';
export type EmcrActivationSource = 'code' | 'manual';

export interface IEmcrDependent {
  patientId: Types.ObjectId;
  relationship?: string;
  source: EmcrDependentSource;
  tenantId?: Types.ObjectId;
  addedAt: Date;
}

export interface IEmcrActivationEntry {
  source: EmcrActivationSource;
  plan: EmcrPlan;
  /** ActivationCode id (code) or a free-text reference (manual). */
  ref?: string;
  batchId?: Types.ObjectId;
  /** The clinic that sold the voucher (commission attribution). */
  tenantId?: Types.ObjectId;
  days: number;
  expiresAt: Date;
  at: Date;
  /** Platform admin email for manual grants. */
  by?: string;
}

export interface IEmcrAccount extends Document {
  /** E.164. Unique when present; accounts created from a password/QR sign-in may have none yet. */
  phone?: string;
  selfPatientId?: Types.ObjectId;
  dependents: IEmcrDependent[];
  otp?: string;
  otpExpiry?: Date;
  otpAttempts: number;
  /** bcrypt hash; never selected by default. */
  password?: string;
  passwordSetAt?: Date;
  /** `staff`: a temporary password from the clinic; the holder must replace it at sign-in. */
  passwordSetBy?: 'user' | 'staff';
  mustChangePassword?: boolean;
  /**
   * Structured sign-in name, used with the password like the phone: `<location>.<initials>.<YYYYMMDD>[.n]`
   * (the local part only; the domain is lib/emcr/login-id.ts LOGIN_ID_DOMAIN). Not a mailbox.
   */
  loginId?: string;
  activation?: {
    plan: EmcrPlan;
    activatedAt: Date;
    expiresAt: Date;
    /** Renewal reminders already sent for the current expiry, e.g. ['30', '7', '0']. */
    remindersSent?: string[];
  };
  activationHistory: IEmcrActivationEntry[];
  disabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DependentSchema = new Schema<IEmcrDependent>(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    relationship: { type: String, trim: true },
    source: { type: String, enum: ['phone_dob', 'clinic'], required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ActivationEntrySchema = new Schema<IEmcrActivationEntry>(
  {
    source: { type: String, enum: ['code', 'manual'], required: true },
    plan: { type: String, enum: ['basic', 'plus'], default: 'basic' },
    ref: { type: String },
    batchId: { type: Schema.Types.ObjectId, ref: 'VoucherBatch' },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
    days: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    at: { type: Date, default: Date.now },
    by: { type: String },
  },
  { _id: false }
);

const EmcrAccountSchema = new Schema<IEmcrAccount>(
  {
    phone: { type: String, trim: true },
    selfPatientId: { type: Schema.Types.ObjectId, ref: 'Patient' },
    dependents: { type: [DependentSchema], default: [] },
    otp: { type: String, select: false },
    otpExpiry: { type: Date },
    otpAttempts: { type: Number, default: 0 },
    password: { type: String, select: false },
    passwordSetAt: { type: Date },
    passwordSetBy: { type: String, enum: ['user', 'staff'] },
    mustChangePassword: { type: Boolean },
    loginId: { type: String, lowercase: true, trim: true },
    activation: {
      plan: { type: String, enum: ['basic', 'plus'] },
      activatedAt: { type: Date },
      expiresAt: { type: Date },
      remindersSent: { type: [String], default: undefined },
    },
    activationHistory: { type: [ActivationEntrySchema], default: [] },
    disabled: { type: Boolean },
  },
  { timestamps: true }
);

EmcrAccountSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
EmcrAccountSchema.index({ selfPatientId: 1 }, { unique: true, partialFilterExpression: { selfPatientId: { $exists: true } } });
EmcrAccountSchema.index({ 'dependents.patientId': 1 });
EmcrAccountSchema.index({ loginId: 1 }, { unique: true, partialFilterExpression: { loginId: { $type: 'string' } } });
EmcrAccountSchema.index({ 'activation.expiresAt': 1 });

export default mongoose.models.EmcrAccount || mongoose.model<IEmcrAccount>('EmcrAccount', EmcrAccountSchema);
