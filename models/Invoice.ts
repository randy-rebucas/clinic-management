import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IBillingItem {
  code?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface IInvoice extends Document {
  patient: Types.ObjectId;
  visit?: Types.ObjectId;
  invoiceNumber: string;
  items: IBillingItem[];
  subtotal?: number;
  discounts: Array<{
    reason?: string;
    amount: number;
  }>;
  tax?: number;
  total?: number;
  payments: Array<{
    method?: string; // cash, card, philhealth, etc
    amount: number;
    date: Date;
    receiptNo?: string;
  }>;
  status: 'unpaid' | 'partial' | 'paid' | 'refunded';
  createdAt: Date;
  createdBy?: Types.ObjectId;
  updatedAt: Date;
}

const BillingItemSchema: Schema = new Schema(
  {
    code: String,
    description: String,
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

const InvoiceSchema: Schema = new Schema(
  {
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    visit: { type: Schema.Types.ObjectId, ref: 'Visit' },
    invoiceNumber: { type: String, index: true, required: true },
    items: [BillingItemSchema],
    subtotal: Number,
    discounts: [{ reason: String, amount: Number }],
    tax: Number,
    total: Number,
    payments: [
      {
        method: { type: String }, // cash, card, philhealth, etc
        amount: Number,
        date: Date,
        receiptNo: String,
      },
    ],
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
InvoiceSchema.index({ invoiceNumber: 1 });

export default mongoose.models.Invoice || mongoose.model<IInvoice>('Invoice', InvoiceSchema);

