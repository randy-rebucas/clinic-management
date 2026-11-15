/**
 * What a patient sees of an invoice (eMCR `Invoice`, lib/invoices.ts, app/patient/invoices/*):
 * line items, discounts, tax, totals, the payments made and the status. A whitelist, so a field
 * added to the model later stays staff-only until it is listed here. Never the professional-fee
 * split, who processed or applied what, staff notes, payment-account and checkout ids, payment
 * claims, PhilHealth/HMO claim internals or BIR issuing bookkeeping. Paying goes through
 * …/invoices/[id]/pay-link, which reads the invoice itself.
 */
export const PATIENT_INVOICE_SELECT = [
  'tenantId',
  'patient',
  'visit',
  'invoiceNumber',
  ...['code', 'description', 'category', 'quantity', 'unitPrice', 'total'].map((f) => `items.${f}`),
  'subtotal',
  ...['type', 'reason', 'percentage', 'amount'].map((f) => `discounts.${f}`),
  'tax',
  'total',
  ...['method', 'amount', 'date', 'receiptNo', 'referenceNo', 'refundedAt', 'refundedAmount'].map((f) => `payments.${f}`),
  'outstandingBalance',
  'totalPaid',
  'status',
  // The official (BIR) invoice number the patient's receipt carries.
  'bir.serialNo',
  'createdAt',
  'updatedAt',
].join(' ');

/** Invoices that still owe something; the list's summary adds up their balances. */
export const OPEN_INVOICE_STATUSES = ['unpaid', 'partial'];
