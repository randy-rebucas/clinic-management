import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { PAYMENT_PROVIDERS, type PaymentProvider } from '@/lib/payments/providers';

/**
 * Where a clinic (or one of its doctors) takes patients' payments (lib/payments). Online
 * providers keep their keys encrypted (lib/encryption.ts) and never send them back; manual
 * methods (GCash/Maya QR, bank transfer) keep what the patient is shown.
 *
 * Patient bills are paid into these accounts, never the platform's PayMongo account.
 */
export { PAYMENT_PROVIDERS, ONLINE_PROVIDERS, isOnlineProvider } from '@/lib/payments/providers';
export type { PaymentProvider, OnlineProvider } from '@/lib/payments/providers';

export interface IPaymentAccount extends Document {
  tenantId: Types.ObjectId;
  ownerType: 'clinic' | 'doctor';
  /** The Doctor whose account this is (ownerType doctor). */
  doctorId?: Types.ObjectId;
  provider: PaymentProvider;
  label: string;
  isDefault: boolean;
  enabled: boolean;
  /** Online providers: encrypted secret key / webhook (callback) secret; never selected by default. */
  secretKeyEnc?: string;
  webhookSecretEnc?: string;
  /** Maya: the public key the checkout is created with. */
  publicKey?: string;
  secretLast4?: string;
  mode?: 'live' | 'test';
  /** Random, in the account's own webhook URL (/api/payments/webhook/<provider>/<token>). */
  webhookToken: string;
  /** Manual methods: what the patient is shown. */
  manual?: {
    accountName?: string;
    number?: string;
    bankName?: string;
    /** QR image as a data URL (PNG/JPEG, small); only sent to the patient's pay page. */
    qrImage?: string;
    instructions?: string;
  };
  verifiedAt?: Date;
  lastWebhookAt?: Date;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentAccountSchema = new Schema<IPaymentAccount>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    ownerType: { type: String, enum: ['clinic', 'doctor'], required: true },
    doctorId: { type: Schema.Types.ObjectId, ref: 'Doctor' },
    provider: { type: String, enum: PAYMENT_PROVIDERS, required: true },
    label: { type: String, required: true, trim: true, maxlength: 100 },
    isDefault: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    secretKeyEnc: { type: String, select: false },
    webhookSecretEnc: { type: String, select: false },
    publicKey: { type: String, trim: true, maxlength: 200 },
    secretLast4: { type: String },
    mode: { type: String, enum: ['live', 'test'] },
    webhookToken: { type: String, required: true },
    manual: {
      accountName: { type: String, trim: true, maxlength: 150 },
      number: { type: String, trim: true, maxlength: 60 },
      bankName: { type: String, trim: true, maxlength: 100 },
      qrImage: { type: String, select: false },
      instructions: { type: String, trim: true, maxlength: 500 },
    },
    verifiedAt: { type: Date },
    lastWebhookAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

PaymentAccountSchema.index({ webhookToken: 1 }, { unique: true });
PaymentAccountSchema.index({ tenantId: 1, ownerType: 1, doctorId: 1 });
// One default per owner (the clinic, or each doctor).
PaymentAccountSchema.index(
  { tenantId: 1, ownerType: 1, doctorId: 1, isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } }
);

const PaymentAccount: Model<IPaymentAccount> =
  (mongoose.models.PaymentAccount as Model<IPaymentAccount>) ||
  mongoose.model<IPaymentAccount>('PaymentAccount', PaymentAccountSchema);

export default PaymentAccount;
