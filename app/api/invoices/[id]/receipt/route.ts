import { NextRequest, NextResponse, after } from 'next/server';
import { logPrinted } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import mongoose, { Types } from 'mongoose';
import Invoice from '@/models/Invoice';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, patientTenantFilter } from '@/lib/api/tenant-session';
import { getSettings } from '@/lib/settings';
import { issueSeal, tenantScopedQuery, IssuedSeal } from '@/lib/document-seal';
import { escapeHtml as e, sealedDocumentParts } from '@/lib/document-protection';
import { documentResponse, pdfFilename } from '@/lib/pdf';
import { birSettingsOf } from '@/lib/bir';
import { issueBirSerial } from '@/lib/bir-issue';
import { birInvoiceHTML } from '@/lib/bir-invoice-html';
import { getTenantTimezone } from '@/lib/clinic-timezone';

// Headroom for a cold Chromium start when ?format=pdf.
export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'invoices', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    const query = id ? tenantScopedQuery(id, tenantId) : null;
    if (!query) {
      return NextResponse.json(
        { success: false, error: 'Invalid invoice ID' },
        { status: 400 }
      );
    }

    const load = () =>
      Invoice.findOne(query)
        .populate({
          path: 'patient',
          select: 'firstName lastName patientCode email phone dateOfBirth address',
          match: patientTenantFilter(tenantId),
        })
        .populate('visit', 'visitCode date')
        .populate('createdBy', 'name email');
    let invoice = await load();

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
        { status: 404 }
      );
    }

    if (invoice.status === 'refunded') {
      return NextResponse.json(
        { success: false, error: 'Receipts cannot be issued for refunded invoices' },
        { status: 409 }
      );
    }

    // An official receipt acknowledges money received; none can be issued before a payment.
    const paid = (invoice.payments || []).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
    if (paid <= 0) {
      return NextResponse.json(
        { success: false, error: 'Nothing has been paid on this invoice yet, so there is no receipt to print' },
        { status: 409 }
      );
    }

    // Invoices made under BIR rules print as a BIR sales invoice, with a serial issued on first print.
    const settings = await getSettings(tenantId);
    const bir = birSettingsOf(settings.birSettings);
    const asBir = Boolean(invoice.bir?.serialNo || (bir.enabled && invoice.taxBreakdown));
    if (asBir && !invoice.bir?.serialNo) {
      const issued = await issueBirSerial({ tenantId: String(tenantId), invoiceId: String(invoice._id), userId: session.userId, bir });
      if (!issued.ok) return NextResponse.json({ success: false, error: issued.error }, { status: issued.status });
      invoice = await load();
      if (!invoice) return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }

    // Seal is computed from the stored record, before any display-only population below
    const seal = await issueSeal({
      request,
      documentType: 'receipt',
      document: invoice,
      tenantId,
      userId: session.userId,
    });

    // Manually populate items.serviceId if needed (convert to plain object first)
    const invoiceData = invoice.toObject ? invoice.toObject() : invoice;
    // The patient's data was erased; the invoice is kept for BIR with the buyer as they were.
    if (invoiceData.billedTo?.name) {
      invoiceData.patient = { _id: invoiceData.patient?._id, firstName: invoiceData.billedTo.name, address: invoiceData.billedTo.address };
    }
    
    // Populate serviceId for each item if it exists
    if (invoiceData.items && Array.isArray(invoiceData.items)) {
      const Service = mongoose.models.Service;
      if (Service) {
        const populatedItems = await Promise.all(
          invoiceData.items.map(async (item: any) => {
            if (item.serviceId && typeof item.serviceId === 'object' && item.serviceId._id) {
              // Already populated
              return item;
            }
            if (item.serviceId && Types.ObjectId.isValid(String(item.serviceId))) {
              try {
                const service = await Service.findOne({ _id: item.serviceId, tenantId: new Types.ObjectId(tenantId) })
                  .select('name code category unitPrice')
                  .lean();
                if (service) {
                  item.serviceId = service;
                }
              } catch (err) {
                // Silently skip if service not found
              }
            }
            return item;
          })
        );
        invoiceData.items = populatedItems;
      }
    }

    // Generate HTML for printable receipt (EOR - Electronic Official Receipt)
    const html = asBir
      ? birInvoiceHTML({
          invoice: invoiceData,
          bir,
          clinic: {
            name: settings.clinicName || 'MyClinicSoft',
            address: settings.clinicAddress || '',
            phone: settings.clinicPhone || '',
            email: settings.clinicEmail || '',
            tin: settings.taxId || '',
          },
          currency: settings.billingSettings?.currency || 'PHP',
          timezone: await getTenantTimezone(tenantId),
          protection: sealedDocumentParts({ seal, clinicName: settings.clinicName || 'MyClinicSoft', documentLabel: 'Sales Invoice', documentCode: invoiceData.bir?.serialNo }),
        })
      : await generateReceiptHTML(invoiceData, tenantId, seal);
    after(() =>
      logPrinted({
        session,
        tenantId,
        resource: 'invoice',
        resourceId: id,
        patientId: invoiceData.patient?._id,
        what: asBir ? `sales invoice ${invoiceData.bir?.serialNo}` : 'an official receipt',
        seal,
        request,
      })
    );

    return documentResponse(
      request,
      html,
      pdfFilename(asBir ? 'Sales-Invoice' : 'Receipt', asBir ? invoiceData.bir?.serialNo : invoiceData.invoiceNumber)
    );
  } catch (error: any) {
    console.error('Error generating receipt:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate receipt' },
      { status: 500 }
    );
  }
}

async function generateReceiptHTML(invoice: any, tenantId: string | null | undefined, seal: IssuedSeal): Promise<string> {
  const settings = await getSettings(tenantId);
  const currency = settings.billingSettings?.currency || 'PHP';
  const clinicName = settings.clinicName || 'MyClinicSoft';
  const clinicAddress = settings.clinicAddress || '';
  const clinicPhone = settings.clinicPhone || '';
  const clinicEmail = settings.clinicEmail || '';
  const clinicTin = settings.taxId || '';

  const patient = invoice.patient || {};
  const protection = sealedDocumentParts({
    seal,
    clinicName,
    documentLabel: 'Official Receipt',
    documentCode: invoice.invoiceNumber,
  });
  const date = new Date(invoice.createdAt).toLocaleDateString();
  const time = new Date(invoice.createdAt).toLocaleTimeString();
  const totalPaid = invoice.payments?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: currency,
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
      philhealth: 'PhilHealth',
      cwt: 'Withholding tax (BIR 2307)',
      online: 'Online payment',
      other: 'Other',
    };
    return methods[method] || method;
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Official Receipt ${e(invoice.invoiceNumber)}</title>
  ${protection.head}
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
  ${protection.watermark}
  <div class="no-print print-button">
    <button data-print>Print Receipt</button>
  </div>
  ${protection.banner}

  <div class="header">
    <h1>OFFICIAL RECEIPT</h1>
    <h2>Electronic Official Receipt (EOR)</h2>
  </div>

  <div class="receipt-info">
    <div>
      <strong>Receipt Number:</strong> ${e(invoice.invoiceNumber)}<br>
      <strong>Date:</strong> ${date}<br>
      <strong>Time:</strong> ${time}
    </div>
    <div style="text-align: right;">
      <strong>Status:</strong> ${e(String(invoice.status || '').toUpperCase())}<br>
      ${invoice.visit ? `<strong>Visit:</strong> ${e(invoice.visit.visitCode)}<br>` : ''}
    </div>
  </div>

  <div class="info-section">
    <h3 style="margin-bottom: 10px; color: #1f2937;">Patient Information</h3>
    <div class="info-row">
      <div class="info-label">Name:</div>
      <div>${e(patient.firstName)} ${e(patient.lastName)}${patient.patientCode ? ` (${e(patient.patientCode)})` : ''}</div>
    </div>
    ${patient.email ? `
    <div class="info-row">
      <div class="info-label">Email:</div>
      <div>${e(patient.email)}</div>
    </div>
    ` : ''}
    ${patient.phone ? `
    <div class="info-row">
      <div class="info-label">Phone:</div>
      <div>${e(patient.phone)}</div>
    </div>
    ` : ''}
    ${patient.address ? `
    <div class="info-row">
      <div class="info-label">Address:</div>
      <div>${e(typeof patient.address === 'object'
        ? [patient.address.street, patient.address.city, [patient.address.state, patient.address.zipCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')
        : patient.address)}</div>
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
      ${invoice.items.map((item: any, index: number) => {
        const serviceName = typeof item.serviceId === 'object' && item.serviceId?.name 
          ? item.serviceId.name 
          : item.description || 'Service';
        return `
        <tr>
          <td>${e(item.code || `Item ${index + 1}`)}</td>
          <td>${e(serviceName)}</td>
          <td class="text-right">${e(item.quantity || 1)}</td>
          <td class="text-right">${formatCurrency(item.unitPrice || 0)}</td>
          <td class="text-right">${formatCurrency(item.total || 0)}</td>
        </tr>
      `;
      }).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="total-row">
      <span>Subtotal:</span>
      <span>${formatCurrency(invoice.subtotal || 0)}</span>
    </div>
    ${invoice.discounts && invoice.discounts.length > 0 ? invoice.discounts.map((disc: any) => `
      <div class="total-row">
        <span>Discount (${e(disc.type || disc.reason || 'Discount')}):</span>
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
            <strong>Payment ${index + 1}:</strong> ${e(formatPaymentMethod(payment.method))}
            ${payment.receiptNo ? ` (Receipt: ${e(payment.receiptNo)})` : ''}
            ${payment.referenceNo ? ` (Ref: ${e(payment.referenceNo)})` : ''}
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
        <div>${e(invoice.insurance.provider)}</div>
      </div>
      ${invoice.insurance.policyNumber ? `
        <div class="info-row">
          <div class="info-label">Policy Number:</div>
          <div>${e(invoice.insurance.policyNumber)}</div>
        </div>
      ` : ''}
      ${invoice.insurance.memberId ? `
        <div class="info-row">
          <div class="info-label">Member ID:</div>
          <div>${e(invoice.insurance.memberId)}</div>
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
          <div>${e(String(invoice.insurance.status).toUpperCase())}</div>
        </div>
      ` : ''}
    </div>
  ` : ''}

  ${protection.seal}

  <div class="footer">
    <p><strong>${e(clinicName)}</strong></p>
    ${clinicAddress ? `<p>${e(clinicAddress)}</p>` : ''}
    ${clinicPhone ? `<p>Phone: ${e(clinicPhone)}</p>` : ''}
    ${clinicEmail ? `<p>Email: ${e(clinicEmail)}</p>` : ''}
    ${clinicTin ? `<p>TIN: ${e(clinicTin)}</p>` : ''}
    <p style="margin-top: 20px;"><strong>This is an official receipt. Please keep this for your records.</strong></p>
    <p style="margin-top: 10px;">Generated on ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
  `;
}

