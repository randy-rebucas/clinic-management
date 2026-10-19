// Automatic Invoice Generation Automation
// Generates invoices automatically when visits are completed

import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import Visit from '@/models/Visit';
import Service from '@/models/Service';
import { getSettings } from '@/lib/settings';
import { calculateDiscounts, getBestDiscount, DiscountEligibility } from '@/lib/discount-calculator';
import Procedure from '@/models/Procedure';
import { computeInvoiceTotals } from '@/lib/invoice-totals';
import { taxProfileOf } from '@/lib/bir';
import { createNotification } from '@/lib/notifications';
import { sendEmail, escapeHtml } from '@/lib/email';
import { FALLBACK_VISIT_FEE, pickVisitFee } from '@/lib/services';
import { nextSequence, formatCode, maxCodeSeed } from '@/lib/counters';
import { Types } from 'mongoose';

export interface AutoInvoiceOptions {
  visitId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  createdBy?: string | Types.ObjectId;
  sendNotification?: boolean;
  sendEmail?: boolean;
}

/**
 * Automatically generate invoice for a completed visit
 */
export async function generateInvoiceForVisit(options: AutoInvoiceOptions): Promise<{
  success: boolean;
  invoice?: any;
  error?: string;
  skipped?: boolean;
  reason?: string;
}> {
  try {
    await connectDB();

    if (!options.tenantId) {
      return { success: false, error: 'Tenant is required' };
    }
    const tenantId = new Types.ObjectId(String(options.tenantId));
    const visitId = new Types.ObjectId(String(options.visitId));

    // Get visit with populated data
    const visit = await Visit.findOne({ _id: visitId, tenantId })
      .populate('patient', 'firstName lastName patientCode email phone dateOfBirth discountEligibility')
      .populate('provider', 'name email');

    if (!visit) {
      return { success: false, error: 'Visit not found' };
    }

    // Check if visit is closed/completed
    if (visit.status !== 'closed') {
      return { 
        success: false, 
        skipped: true, 
        reason: 'Visit is not closed/completed' 
      };
    }

    // Check if invoice already exists for this visit
    const existingInvoice = await Invoice.findOne({ visit: visitId, tenantId });

    if (existingInvoice) {
      return { 
        success: false, 
        skipped: true, 
        reason: 'Invoice already exists for this visit',
        invoice: existingInvoice
      };
    }

    // Get settings for invoice prefix and billing configuration
    const settings = await getSettings(tenantId.toString());
    const invoicePrefix =
      String(settings.billingSettings?.invoicePrefix || 'INV').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 10) || 'INV';
    const autoInvoiceEnabled = (settings.automationSettings as any)?.autoInvoiceGeneration !== false; // Default to true
    const defaultConsultationFee = (settings.billingSettings as any)?.defaultConsultationFee || FALLBACK_VISIT_FEE;

    if (!autoInvoiceEnabled) {
      return { 
        success: false, 
        skipped: true, 
        reason: 'Automatic invoice generation is disabled in settings' 
      };
    }

    // Get patient for discount calculation
    const patient = visit.patient as any;
    if (!patient) {
      return { success: false, error: 'Patient not found' };
    }

    // Build invoice items from visit
    const items: any[] = [];
    const vatOf = (v?: string) => (v === 'exempt' || v === 'zero_rated' ? v : 'vatable');

    // Add consultation fee based on visit type: the same rule /admin/services shows
    const catalog = await Service.find({ tenantId, category: { $in: ['consultation', 'procedure'] }, active: true })
      .select('name code category type unitPrice vatClass active')
      .lean<{ _id: Types.ObjectId; name: string; code: string; category: string; type?: string; unitPrice: number; vatClass?: string; active: boolean }[]>();
    const consultations = catalog.filter((s) => s.category === 'consultation');
    const consultationService = pickVisitFee(consultations, String(visit.visitType || ''))?.service ?? null;

    if (consultationService) {
      items.push({
        serviceId: consultationService._id,
        code: consultationService.code,
        description: consultationService.name,
        category: 'consultation',
        quantity: 1,
        unitPrice: consultationService.unitPrice,
        vatClass: vatOf(consultationService.vatClass),
      });
    } else {
      // Fallback: use default consultation fee from settings
      items.push({
        code: 'CONSULT',
        description: `${visit.visitType} Consultation`,
        category: 'consultation',
        quantity: 1,
        unitPrice: defaultConsultationFee,
        vatClass: 'vatable',
      });
    }

    // Procedures done in the visit, priced from the price list: a procedure service whose kind
    // (or name) matches the procedure's type. Unpriced procedures are left for staff to add.
    if (visit.proceduresPerformed && visit.proceduresPerformed.length > 0) {
      const procedures = await Procedure.find({ tenantId, _id: { $in: visit.proceduresPerformed } }).select('type').lean<{ type?: string }[]>();
      const norm = (v?: string) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const priced = catalog.filter((s) => s.category === 'procedure');
      for (const proc of procedures) {
        const key = norm(proc.type);
        if (!key) continue;
        const service = priced.find((s) => norm(s.type) === key) ?? priced.find((s) => norm(s.name) === key || norm(s.code) === key);
        if (!service) continue;
        const existing = items.find((i) => i.serviceId && String(i.serviceId) === String(service._id));
        if (existing) existing.quantity += 1;
        else
          items.push({
            serviceId: service._id,
            code: service.code,
            description: service.name,
            category: 'procedure',
            quantity: 1,
            unitPrice: service.unitPrice,
            vatClass: vatOf(service.vatClass),
          });
      }
    }

    // Calculate discounts
    const discountEligibility = patient.discountEligibility || {};
    const eligibility: DiscountEligibility = {
      pwd: discountEligibility.pwd ? {
        eligible: discountEligibility.pwd.eligible || false,
        idNumber: discountEligibility.pwd.idNumber
      } : undefined,
      senior: discountEligibility.senior ? {
        eligible: discountEligibility.senior.eligible || false,
        idNumber: discountEligibility.senior.idNumber
      } : undefined,
      membership: discountEligibility.membership ? {
        eligible: discountEligibility.membership.eligible || false,
        membershipType: discountEligibility.membership.membershipType,
        membershipNumber: discountEligibility.membership.membershipNumber,
        discountPercentage: discountEligibility.membership.discountPercentage
      } : undefined,
    };

    // One discount: the highest the patient qualifies for. A senior citizen or PWD takes the
    // statutory 20% or another discount, never both (RA 9994 §4), so they never stack.
    const subtotalBefore = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const best = getBestDiscount(calculateDiscounts(subtotalBefore, eligibility, patient.dateOfBirth));
    const chosen = best
      ? [{
          type: best.type,
          reason: best.reason,
          percentage: best.percentage,
          ...(best.type === 'senior' && discountEligibility.senior?.idNumber ? { idNumber: discountEligibility.senior.idNumber } : {}),
          ...(best.type === 'pwd' && discountEligibility.pwd?.idNumber ? { idNumber: discountEligibility.pwd.idNumber } : {}),
        }]
      : [];

    const taxProfile = taxProfileOf(settings.birSettings);
    const totals = computeInvoiceTotals({
      items,
      discounts: chosen,
      taxRate: settings.billingSettings?.taxRate || 0,
      appliedBy: String(options.createdBy || visit.provider?._id || ''),
      taxProfile,
    });

    // Same counter key as app/api/invoices so both paths share one sequence.
    const seq = await nextSequence(
      tenantId,
      'invoice',
      maxCodeSeed(Invoice, 'invoiceNumber', { tenantId, invoiceNumber: { $exists: true, $ne: null } })
    );
    const invoiceNumber = formatCode(invoicePrefix, seq);

    // Create invoice
    const invoiceData: any = {
      tenantId,
      patient: patient._id,
      visit: visit._id,
      invoiceNumber,
      items: totals.items,
      subtotal: totals.subtotal,
      discounts: totals.discounts.map((d) => ({ ...d, appliedBy: options.createdBy || visit.provider?._id })),
      tax: totals.tax,
      total: totals.total,
      ...(totals.breakdown ? { taxBreakdown: totals.breakdown } : {}),
      outstandingBalance: totals.total,
      totalPaid: 0,
      status: totals.total > 0 ? 'unpaid' : 'paid',
      createdBy: options.createdBy || visit.provider?._id,
    };

    const invoice = await Invoice.create(invoiceData);

    // Populate invoice for notifications
    await invoice.populate('patient', 'firstName lastName email phone');
    await invoice.populate('visit', 'visitCode date');

    // Send notifications
    if (options.sendNotification !== false) {
      // Patients have no User account; only the provider (a User) gets an in-app notification.
      const providerId = (visit.provider as any)?._id;
      if (providerId && String(providerId) !== String(options.createdBy || '')) {
        await createNotification({
          userId: providerId,
          tenantId,
          type: 'invoice',
          priority: 'normal',
          title: 'Invoice Generated',
          message: `Invoice ${invoiceNumber} has been generated for visit ${visit.visitCode}`,
          relatedEntity: {
            type: 'invoice',
            id: invoice._id,
          },
          actionUrl: `/invoices/${invoice._id}`,
        }).catch(console.error);
      }
    }

    // Send email if enabled
    if (options.sendEmail && patient.email) {
      try {
        const emailContent = generateInvoiceEmail(invoice);
        await sendEmail({
          to: patient.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });
      } catch (emailError) {
        console.error('Error sending invoice email:', emailError);
        // Don't fail the whole operation if email fails
      }
    }

    return { success: true, invoice };
  } catch (error: any) {
    console.error('Error generating invoice for visit:', error);
    return { 
      success: false, 
      error: 'Failed to generate invoice',
    };
  }
}

/**
 * Generate email content for invoice
 */
export function generateInvoiceEmail(invoice: any): { subject: string; html: string } {
  const patient = invoice.patient as any;
  const subject = `Invoice ${invoice.invoiceNumber} - ${invoice.total?.toFixed(2)}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .info-box { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #4CAF50; }
        .items-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        .items-table th, .items-table td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        .items-table th { background-color: #f2f2f2; }
        .total-row { font-weight: bold; font-size: 1.1em; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Invoice ${invoice.invoiceNumber}</h1>
        </div>
        <div class="content">
          <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
          <p>Your invoice has been generated:</p>
          <div class="info-box">
            <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
            <p><strong>Date:</strong> ${new Date(invoice.createdAt).toLocaleDateString()}</p>
            ${invoice.visit ? `<p><strong>Visit Code:</strong> ${escapeHtml((invoice.visit as any).visitCode)}</p>` : ''}
          </div>
          <table class="items-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${invoice.items.map((item: any) => `
                <tr>
                  <td>${escapeHtml(item.description || item.code)}</td>
                  <td>${item.quantity}</td>
                  <td>${item.unitPrice?.toFixed(2)}</td>
                  <td>${item.total?.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${invoice.discounts && invoice.discounts.length > 0 ? `
            <p><strong>Discounts:</strong></p>
            <ul>
              ${invoice.discounts.map((disc: any) => `
                <li>${escapeHtml(disc.reason)}:${disc.amount?.toFixed(2)}</li>
              `).join('')}
            </ul>
          ` : ''}
          <div class="info-box">
            <p><strong>Subtotal:</strong> ${invoice.subtotal?.toFixed(2)}</p>
            ${invoice.tax ? `<p><strong>Tax:</strong> ${invoice.tax.toFixed(2)}</p>` : ''}
            <p class="total-row"><strong>Total:</strong> ${invoice.total?.toFixed(2)}</p>
            <p><strong>Outstanding Balance:</strong> ${invoice.outstandingBalance?.toFixed(2)}</p>
          </div>
          <p>Please settle your account at your earliest convenience.</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}

