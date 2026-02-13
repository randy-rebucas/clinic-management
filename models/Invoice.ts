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
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;
  
  patient: Types.ObjectId;
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
    // Tenant reference for multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
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

// Indexes for efficient queries (tenant-scoped)
InvoiceSchema.index({ tenantId: 1, patient: 1, createdAt: -1 });
InvoiceSchema.index({ tenantId: 1, visit: 1 });
InvoiceSchema.index({ tenantId: 1, status: 1 });
InvoiceSchema.index({ tenantId: 1, invoiceNumber: 1 });
InvoiceSchema.index({ tenantId: 1, createdBy: 1 });
InvoiceSchema.index({ tenantId: 1, createdBy: 1, createdAt: -1 }); // For creator history
InvoiceSchema.index({ tenantId: 1, status: 1, createdAt: -1 }); // For status-based date queries
InvoiceSchema.index({ tenantId: 1, patient: 1, status: 1 }); // For patient's unpaid invoices
InvoiceSchema.index({ tenantId: 1, 'insurance.status': 1 }); // For insurance claim queries
InvoiceSchema.index({ tenantId: 1, createdAt: 1, status: 1 }); // For period + status queries (dashboard, reports)
InvoiceSchema.index({ tenantId: 1, visit: 1, status: 1 }); // For visit's invoices by status

export default mongoose.models.Invoice || mongoose.model<IInvoice>('Invoice', InvoiceSchema);

