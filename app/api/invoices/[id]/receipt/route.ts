import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const { id } = await params;
    const invoice = await Invoice.findById(id)
      .populate('patient', 'firstName lastName patientCode email phone dateOfBirth address')
      .populate('visit', 'visitCode date')
      .populate('createdBy', 'name email')
      .populate('items.serviceId', 'name code category unitPrice');

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }

    // Generate HTML for printable receipt (EOR - Electronic Official Receipt)
    const html = generateReceiptHTML(invoice);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error: any) {
    console.error('Error generating receipt:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate receipt' },
      { status: 500 }
    );
  }
}

function generateReceiptHTML(invoice: any): string {
  const patient = invoice.patient;
  const date = new Date(invoice.createdAt).toLocaleDateString();
  const time = new Date(invoice.createdAt).toLocaleTimeString();
  const totalPaid = invoice.payments?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount);
  };

  const formatPaymentMethod = (method: string) => {
    const methods: Record<string, string> = {
      cash: 'Cash',
      gcash: 'GCash',
      bank_transfer: 'Bank Transfer',
      card: 'Credit/Debit Card',
      check: 'Check',
      insurance: 'Insurance',
      hmo: 'HMO',
      other: 'Other',
    };
    return methods[method] || method;
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Official Receipt ${invoice.invoiceNumber}</title>
  <style>
    @media print {
      @page {
        size: A4;
        margin: 15mm;
      }
      body {
        margin: 0;
        padding: 0;
      }
      .no-print {
        display: none;
      }
    }
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      margin: 0;
      color: #2563eb;
      font-size: 28px;
    }
    .header h2 {
      margin: 5px 0;
      color: #1f2937;
      font-size: 18px;
      font-weight: normal;
    }
    .receipt-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
      padding: 15px;
      background-color: #f9fafb;
      border-radius: 5px;
    }
    .info-section {
      margin-bottom: 20px;
    }
    .info-row {
      display: flex;
      margin-bottom: 8px;
    }
    .info-label {
      font-weight: bold;
      width: 150px;
      color: #4b5563;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .items-table th,
    .items-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    .items-table th {
      background-color: #f3f4f6;
      font-weight: bold;
      color: #1f2937;
    }
    .items-table td {
      color: #4b5563;
    }
    .text-right {
      text-align: right;
    }
    .totals {
      margin-top: 20px;
      margin-left: auto;
      width: 300px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .total-row.final {
      border-top: 2px solid #1f2937;
      border-bottom: 2px solid #1f2937;
      font-weight: bold;
      font-size: 18px;
      margin-top: 10px;
      padding-top: 15px;
    }
    .payments {
      margin-top: 30px;
      padding: 15px;
      background-color: #f0fdf4;
      border-left: 4px solid #22c55e;
      border-radius: 5px;
    }
    .payment-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #d1d5db;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
    }
    .print-button {
      margin-bottom: 20px;
      text-align: center;
    }
    .print-button button {
      padding: 12px 24px;
      background-color: #2563eb;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 16px;
    }
    .print-button button:hover {
      background-color: #1d4ed8;
    }
  </style>
</head>
<body>
  <div class="no-print print-button">
    <button onclick="window.print()">Print Receipt</button>
  </div>

  <div class="header">
    <h1>OFFICIAL RECEIPT</h1>
    <h2>Electronic Official Receipt (EOR)</h2>
  </div>

  <div class="receipt-info">
    <div>
      <strong>Receipt Number:</strong> ${invoice.invoiceNumber}<br>
      <strong>Date:</strong> ${date}<br>
      <strong>Time:</strong> ${time}
    </div>
    <div style="text-align: right;">
      <strong>Status:</strong> ${invoice.status.toUpperCase()}<br>
      ${invoice.visit ? `<strong>Visit:</strong> ${invoice.visit.visitCode}<br>` : ''}
    </div>
  </div>

  <div class="info-section">
    <h3 style="margin-bottom: 10px; color: #1f2937;">Patient Information</h3>
    <div class="info-row">
      <div class="info-label">Name:</div>
      <div>${patient.firstName} ${patient.lastName}${patient.patientCode ? ` (${patient.patientCode})` : ''}</div>
    </div>
    ${patient.email ? `
    <div class="info-row">
      <div class="info-label">Email:</div>
      <div>${patient.email}</div>
    </div>
    ` : ''}
    ${patient.phone ? `
    <div class="info-row">
      <div class="info-label">Phone:</div>
      <div>${patient.phone}</div>
    </div>
    ` : ''}
    ${patient.address ? `
    <div class="info-row">
      <div class="info-label">Address:</div>
      <div>${patient.address.street}, ${patient.address.city}, ${patient.address.state} ${patient.address.zipCode}</div>
    </div>
    ` : ''}
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th>Item</th>
        <th>Description</th>
        <th class="text-right">Qty</th>
        <th class="text-right">Unit Price</th>
        <th class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${invoice.items.map((item: any, index: number) => `
        <tr>
          <td>${item.code || `Item ${index + 1}`}</td>
          <td>${item.description || 'Service'}</td>
          <td class="text-right">${item.quantity}</td>
          <td class="text-right">${formatCurrency(item.unitPrice)}</td>
          <td class="text-right">${formatCurrency(item.total)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="total-row">
      <span>Subtotal:</span>
      <span>${formatCurrency(invoice.subtotal || 0)}</span>
    </div>
    ${invoice.discounts && invoice.discounts.length > 0 ? invoice.discounts.map((disc: any) => `
      <div class="total-row">
        <span>Discount (${disc.type || disc.reason || 'Discount'}):</span>
        <span>-${formatCurrency(disc.amount)}</span>
      </div>
    `).join('') : ''}
    ${invoice.tax && invoice.tax > 0 ? `
      <div class="total-row">
        <span>Tax:</span>
        <span>${formatCurrency(invoice.tax)}</span>
      </div>
    ` : ''}
    <div class="total-row final">
      <span>Total Amount:</span>
      <span>${formatCurrency(invoice.total || 0)}</span>
    </div>
  </div>

  ${invoice.payments && invoice.payments.length > 0 ? `
    <div class="payments">
      <h3 style="margin-bottom: 15px; color: #1f2937;">Payment Details</h3>
      ${invoice.payments.map((payment: any, index: number) => `
        <div class="payment-item">
          <div>
            <strong>Payment ${index + 1}:</strong> ${formatPaymentMethod(payment.method)}
            ${payment.receiptNo ? ` (Receipt: ${payment.receiptNo})` : ''}
            ${payment.referenceNo ? ` (Ref: ${payment.referenceNo})` : ''}
            <br>
            <small style="color: #6b7280;">${new Date(payment.date).toLocaleString()}</small>
          </div>
          <div style="font-weight: bold; font-size: 16px;">
            ${formatCurrency(payment.amount)}
          </div>
        </div>
      `).join('')}
      <div class="payment-item" style="border-top: 2px solid #22c55e; margin-top: 10px; padding-top: 10px; font-weight: bold;">
        <div>Total Paid:</div>
        <div style="font-size: 18px;">${formatCurrency(totalPaid)}</div>
      </div>
      ${invoice.outstandingBalance && invoice.outstandingBalance > 0 ? `
        <div class="payment-item" style="color: #dc2626;">
          <div>Outstanding Balance:</div>
          <div style="font-size: 18px; font-weight: bold;">${formatCurrency(invoice.outstandingBalance)}</div>
        </div>
      ` : ''}
    </div>
  ` : ''}

  ${invoice.insurance ? `
    <div style="margin-top: 30px; padding: 15px; background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 5px;">
      <h3 style="margin-bottom: 10px; color: #1f2937;">Insurance/HMO Information</h3>
      <div class="info-row">
        <div class="info-label">Provider:</div>
        <div>${invoice.insurance.provider}</div>
      </div>
      ${invoice.insurance.policyNumber ? `
        <div class="info-row">
          <div class="info-label">Policy Number:</div>
          <div>${invoice.insurance.policyNumber}</div>
        </div>
      ` : ''}
      ${invoice.insurance.memberId ? `
        <div class="info-row">
          <div class="info-label">Member ID:</div>
          <div>${invoice.insurance.memberId}</div>
        </div>
      ` : ''}
      ${invoice.insurance.coverageAmount ? `
        <div class="info-row">
          <div class="info-label">Coverage Amount:</div>
          <div>${formatCurrency(invoice.insurance.coverageAmount)}</div>
        </div>
      ` : ''}
      ${invoice.insurance.status ? `
        <div class="info-row">
          <div class="info-label">Status:</div>
          <div>${invoice.insurance.status.toUpperCase()}</div>
        </div>
      ` : ''}
    </div>
  ` : ''}

  <div class="footer">
    <p><strong>This is an official receipt. Please keep this for your records.</strong></p>
    <p>For inquiries, please contact the clinic.</p>
    <p style="margin-top: 20px;">Generated on ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
  `;
}

