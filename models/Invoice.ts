import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IBillingItem {
  serviceId?: Types.ObjectId; // Reference to Service catalog
  code?: string;
  description?: string;
  category?: string; // consultation, procedure, etc.
  quantity: number;
  unitPrice: number;
  total: number;
  vatClass?: 'vatable' | 'exempt' | 'zero_rated';
}

export const PAYMENT_METHOD_VALUES = ['cash', 'gcash', 'bank_transfer', 'card', 'check', 'insurance', 'hmo', 'philhealth', 'cwt', 'online', 'other'] as const;
export type InvoicePaymentMethod = (typeof PAYMENT_METHOD_VALUES)[number];

export interface IInvoice extends Document {
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;
  
  patient: Types.ObjectId;
  /**
   * The buyer as they were when the patient's data was erased (lib/patient-erasure.ts). Sales
   * invoices are kept for BIR, so the invoice still names who it was sold to; printed in place
   * of the patient record when set.
   */
  billedTo?: { name?: string; address?: { street?: string; city?: string; state?: string; zipCode?: string } };
  visit?: Types.ObjectId;
  invoiceNumber: string;
  items: IBillingItem[];
  subtotal?: number;
  // Professional Fee (separate from facility/service fees)
  professionalFee?: number;
  professionalFeeDoctor?: Types.ObjectId; // Which doctor receives the PF
  professionalFeeType?: 'consultation' | 'procedure' | 'reading' | 'other';
  professionalFeeNotes?: string;
  discounts: Array<{
    type: 'pwd' | 'senior' | 'membership' | 'promotional' | 'other';
    reason?: string;
    /** OSCA / PWD ID number, required in the BIR senior citizen and PWD sales books. */
    idNumber?: string;
    percentage?: number; // Percentage discount (0-100)
    amount: number; // Fixed amount discount
    appliedBy?: Types.ObjectId; // User who applied the discount
  }>;
  tax?: number;
  total?: number;
  /** BIR figures, when the clinic invoiced under a BIR registration (lib/invoice-totals.ts). */
  taxBreakdown?: {
    regime: 'vat' | 'non_vat';
    grossSales: number;
    vatableSales: number;
    vatAmount: number;
    vatExemptSales: number;
    zeroRatedSales: number;
    lessVat: number;
    statutoryDiscount: number;
  };
  /** A PhilHealth claim on this bill: the benefit comes off what the patient pays (lib/philhealth.ts). */
  philhealth?: {
    pin: string;
    relationship: 'member' | 'dependent';
    memberName?: string;
    caseRate?: Types.ObjectId;
    caseRateCode: string;
    caseRateDescription?: string;
    hciAmount: number;
    pfAmount: number;
    amount: number;
    /** Day of the visit, or discharge; the filing deadline runs from it. */
    servedOn: Date;
    status: 'draft' | 'filed' | 'paid' | 'part_paid' | 'returned' | 'denied';
    claimNumber?: string;
    filedAt?: Date;
    paidAt?: Date;
    paidAmount?: number;
    withheldAmount?: number;
    note?: string;
    /** When PhilHealth sent it back for correction; the deadline to file it again runs from here. */
    returnedAt?: Date;
    deniedAt?: Date;
  };
  /** The BIR sales invoice issued for this bill: serial from the registered range, set once. */
  bir?: {
    serialNo?: string;
    issuedAt?: Date;
    issuedBy?: Types.ObjectId;
    /** While a serial is being allocated, so two prints at once can't burn two numbers. */
    lockAt?: Date;
  };
  payments: Array<{
    method: InvoicePaymentMethod;
    amount: number;
    date: Date;
    receiptNo?: string;
    referenceNo?: string; // For GCash, bank transfer, etc.
    processedBy?: Types.ObjectId; // User who processed the payment
    notes?: string;
    /** The clinic's or doctor's PaymentAccount an online payment went into. */
    accountId?: Types.ObjectId;
    /** Set when the payment provider reports a refund (the money left the account). */
    refundedAt?: Date;
    refundedAmount?: number;
  }>;
  /** Online checkouts started for this invoice, so a provider's notice can be matched to one. */
  payLinks?: Array<{
    checkoutId: string;
    accountId: Types.ObjectId;
    provider: string;
    amount: number;
    createdAt: Date;
  }>;
  /** "I've paid" notices from the patient's pay page (GCash/Maya QR, bank transfer), for staff to confirm. */
  paymentClaims?: Array<{
    _id?: Types.ObjectId;
    accountId?: Types.ObjectId;
    method: 'gcash' | 'bank_transfer' | 'other';
    amount: number;
    referenceNo: string;
    payerName?: string;
    note?: string;
    status: 'pending' | 'confirmed' | 'rejected';
    submittedAt: Date;
    decidedAt?: Date;
    decidedBy?: Types.ObjectId;
    reason?: string;
  }>;
  // Insurance/HMO Information
  insurance?: {
    provider: string; // Insurance/HMO company name
    policyNumber?: string;
    memberId?: string;
    coverageType?: 'full' | 'partial' | 'co-pay';
    coverageAmount?: number; // Amount covered by insurance
    claimNumber?: string;
    status?: 'pending' | 'approved' | 'rejected' | 'paid';
    notes?: string;
    /** The payer in the clinic's HMO directory, when picked from it. */
    hmo?: Types.ObjectId;
    /** Letter of authorization (approval code) from the HMO, and when it was given. */
    loaNumber?: string;
    loaDate?: Date;
    /** The transmittal this claim was sent in. */
    batch?: Types.ObjectId;
    submittedAt?: Date;
    paidAmount?: number;
    withheldAmount?: number;
    denialReason?: string;
  };
  // Outstanding balance tracking
  outstandingBalance?: number; // Calculated: total - totalPaid
  totalPaid?: number; // Sum of all payments
  status: 'unpaid' | 'partial' | 'paid' | 'refunded';
  archived?: boolean;
  archivedAt?: Date;
  paymentRemindersSent?: Array<{ level: number; sentAt: Date }>;
  createdAt: Date;
  createdBy?: Types.ObjectId;
  updatedAt: Date;
}

const BillingItemSchema: Schema = new Schema(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service' },
    code: String,
    description: String,
    category: String,
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    vatClass: { type: String, enum: ['vatable', 'exempt', 'zero_rated'] },
  },
  { _id: false }
);

const InvoiceSchema: Schema = new Schema(
  {
    // Tenant reference for multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
    },
    
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    billedTo: {
      name: String,
      address: { street: String, city: String, state: String, zipCode: String },
    },
    visit: { type: Schema.Types.ObjectId, ref: 'Visit' },
    invoiceNumber: { type: String, required: true },
    items: [BillingItemSchema],
    subtotal: Number,
    // Professional Fee fields
    professionalFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    professionalFeeDoctor: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
    },
    professionalFeeType: {
      type: String,
      enum: ['consultation', 'procedure', 'reading', 'other'],
    },
    professionalFeeNotes: String,
    discounts: [{
      type: {
        type: String,
        enum: ['pwd', 'senior', 'membership', 'promotional', 'other'],
        required: true,
      },
      reason: String,
      idNumber: String,
      percentage: Number,
      amount: Number,
      appliedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    }],
    tax: Number,
    total: Number,
    taxBreakdown: {
      type: new Schema(
        {
          regime: { type: String, enum: ['vat', 'non_vat'] },
          grossSales: Number,
          vatableSales: Number,
          vatAmount: Number,
          vatExemptSales: Number,
          zeroRatedSales: Number,
          lessVat: Number,
          statutoryDiscount: Number,
        },
        { _id: false }
      ),
      default: undefined,
    },
    philhealth: {
      type: new Schema(
        {
          pin: { type: String, required: true },
          relationship: { type: String, enum: ['member', 'dependent'], default: 'member' },
          memberName: String,
          caseRate: { type: Schema.Types.ObjectId, ref: 'PhilhealthCaseRate' },
          caseRateCode: { type: String, required: true },
          caseRateDescription: String,
          hciAmount: { type: Number, default: 0 },
          pfAmount: { type: Number, default: 0 },
          amount: { type: Number, default: 0 },
          servedOn: { type: Date, required: true },
          status: { type: String, enum: ['draft', 'filed', 'paid', 'part_paid', 'returned', 'denied'], default: 'draft' },
          claimNumber: String,
          filedAt: Date,
          paidAt: Date,
          paidAmount: Number,
          withheldAmount: Number,
          note: String,
          returnedAt: Date,
          deniedAt: Date,
        },
        { _id: false }
      ),
      default: undefined,
    },
    bir: {
      type: new Schema(
        {
          serialNo: String,
          issuedAt: Date,
          issuedBy: { type: Schema.Types.ObjectId, ref: 'User' },
          lockAt: Date,
        },
        { _id: false }
      ),
      default: undefined,
    },
    payments: [
      {
        method: {
          type: String,
          enum: PAYMENT_METHOD_VALUES,
          required: true,
        },
        amount: { type: Number, required: true },
        date: { type: Date, default: Date.now },
        receiptNo: String,
        referenceNo: String, // For GCash, bank transfer, etc.
        processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        notes: String,
        accountId: { type: Schema.Types.ObjectId, ref: 'PaymentAccount' },
        refundedAt: Date,
        refundedAmount: Number,
      },
    ],
    payLinks: {
      type: [
        new Schema(
          {
            checkoutId: { type: String, required: true },
            accountId: { type: Schema.Types.ObjectId, ref: 'PaymentAccount', required: true },
            provider: { type: String, required: true },
            amount: { type: Number, required: true },
            createdAt: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: undefined,
    },
    paymentClaims: {
      type: [
        new Schema({
          accountId: { type: Schema.Types.ObjectId, ref: 'PaymentAccount' },
          method: { type: String, enum: ['gcash', 'bank_transfer', 'other'], required: true },
          amount: { type: Number, required: true },
          referenceNo: { type: String, required: true, maxlength: 100 },
          payerName: { type: String, maxlength: 150 },
          note: { type: String, maxlength: 500 },
          status: { type: String, enum: ['pending', 'confirmed', 'rejected'], default: 'pending' },
          submittedAt: { type: Date, default: Date.now },
          decidedAt: Date,
          decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
          reason: { type: String, maxlength: 300 },
        }),
      ],
      default: undefined,
    },
    insurance: {
      provider: String,
      policyNumber: String,
      memberId: String,
      coverageType: {
        type: String,
        enum: ['full', 'partial', 'co-pay'],
      },
      coverageAmount: Number,
      claimNumber: String,
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'paid'],
      },
      notes: String,
      hmo: { type: Schema.Types.ObjectId, ref: 'Hmo' },
      loaNumber: String,
      loaDate: Date,
      batch: { type: Schema.Types.ObjectId, ref: 'HmoClaimBatch' },
      submittedAt: Date,
      paidAmount: Number,
      withheldAmount: Number,
      denialReason: String,
    },
    outstandingBalance: Number,
    totalPaid: Number,
    status: { type: String, enum: ['unpaid', 'partial', 'paid', 'refunded'], default: 'unpaid' },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    archived: { type: Boolean },
    archivedAt: { type: Date },
    // Payment reminder sent markers (level = days since invoice)
    paymentRemindersSent: {
      type: [{ level: Number, sentAt: Date, _id: false }],
      default: undefined,
    },
  },
  { timestamps: true }
);

// Indexes for efficient queries (tenant-scoped)
InvoiceSchema.index({ tenantId: 1, patient: 1, createdAt: -1 });
InvoiceSchema.index(
  { tenantId: 1, invoiceNumber: 1 },
  { unique: true, name: 'uniq_tenant_invoiceNumber', partialFilterExpression: { invoiceNumber: { $type: 'string' } } }
);
InvoiceSchema.index({ tenantId: 1, archived: 1, createdAt: 1 });
InvoiceSchema.index({ tenantId: 1, createdBy: 1, createdAt: -1 }); // For creator history
InvoiceSchema.index({ tenantId: 1, status: 1, createdAt: -1 }); // For status-based date queries
InvoiceSchema.index({ tenantId: 1, patient: 1, status: 1 }); // For patient's unpaid invoices
InvoiceSchema.index({ tenantId: 1, 'insurance.status': 1 }); // For insurance claim queries
InvoiceSchema.index({ tenantId: 1, 'insurance.hmo': 1, 'insurance.batch': 1 }); // Claims still to send, per HMO
InvoiceSchema.index({ tenantId: 1, 'philhealth.status': 1, 'philhealth.servedOn': 1 }); // PhilHealth claims by state, nearest deadline first
InvoiceSchema.index({ tenantId: 1, createdAt: 1, status: 1 }); // For period + status queries (dashboard, reports)
InvoiceSchema.index({ tenantId: 1, visit: 1, status: 1 }); // For visit's invoices by status
InvoiceSchema.index(
  { tenantId: 1, 'bir.serialNo': 1 },
  { unique: true, name: 'uniq_tenant_birSerial', partialFilterExpression: { 'bir.serialNo': { $type: 'string' } } }
); // A BIR serial is issued once per clinic
InvoiceSchema.index({ tenantId: 1, 'bir.issuedAt': 1 }); // BIR sales books by issue date

export default mongoose.models.Invoice || mongoose.model<IInvoice>('Invoice', InvoiceSchema);

