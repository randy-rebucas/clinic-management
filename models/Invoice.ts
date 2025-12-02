import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IBillingItem {
  serviceId?: Types.ObjectId; // Reference to Service catalog
  code?: string;
  description?: string;
  category?: string; // consultation, procedure, etc.
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface IInvoice extends Document {
  // Multi-tenant support
  tenantId: Types.ObjectId; // Reference to Tenant
  
  patient: Types.ObjectId;
  visit?: Types.ObjectId;
  invoiceNumber: string;
  items: IBillingItem[];
  subtotal?: number;
  discounts: Array<{
    type: 'pwd' | 'senior' | 'membership' | 'promotional' | 'other';
    reason?: string;
    percentage?: number; // Percentage discount (0-100)
    amount: number; // Fixed amount discount
    appliedBy?: Types.ObjectId; // User who applied the discount
  }>;
  tax?: number;
  total?: number;
  payments: Array<{
    method: 'cash' | 'gcash' | 'bank_transfer' | 'card' | 'check' | 'insurance' | 'hmo' | 'other';
    amount: number;
    date: Date;
    receiptNo?: string;
    referenceNo?: string; // For GCash, bank transfer, etc.
    processedBy?: Types.ObjectId; // User who processed the payment
    notes?: string;
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
  };
  // Outstanding balance tracking
  outstandingBalance?: number; // Calculated: total - totalPaid
  totalPaid?: number; // Sum of all payments
  status: 'unpaid' | 'partial' | 'paid' | 'refunded';
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
  },
  { _id: false }
);

const InvoiceSchema: Schema = new Schema(
  {
    // Multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant is required'],
      index: true,
    },
    
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    visit: { type: Schema.Types.ObjectId, ref: 'Visit' },
    invoiceNumber: { type: String, required: true },
    items: [BillingItemSchema],
    subtotal: Number,
    discounts: [{
      type: {
        type: String,
        enum: ['pwd', 'senior', 'membership', 'promotional', 'other'],
        required: true,
      },
      reason: String,
      percentage: Number,
      amount: Number,
      appliedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    }],
    tax: Number,
    total: Number,
    payments: [
      {
        method: {
          type: String,
          enum: ['cash', 'gcash', 'bank_transfer', 'card', 'check', 'insurance', 'hmo', 'other'],
          required: true,
        },
        amount: { type: Number, required: true },
        date: { type: Date, default: Date.now },
        receiptNo: String,
        referenceNo: String, // For GCash, bank transfer, etc.
        processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        notes: String,
      },
    ],
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
    },
    outstandingBalance: Number,
    totalPaid: Number,
    status: { type: String, enum: ['unpaid', 'partial', 'paid', 'refunded'], default: 'unpaid' },
    createdAt: { type: Date, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Indexes for efficient queries
InvoiceSchema.index({ patient: 1, createdAt: -1 });
InvoiceSchema.index({ visit: 1 });
InvoiceSchema.index({ status: 1 });
InvoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true }); // Invoice number unique per tenant
InvoiceSchema.index({ tenantId: 1 }); // Tenant index
InvoiceSchema.index({ tenantId: 1, patient: 1 });
InvoiceSchema.index({ tenantId: 1, status: 1 });
InvoiceSchema.index({ createdBy: 1 });

export default mongoose.models.Invoice || mongoose.model<IInvoice>('Invoice', InvoiceSchema);

