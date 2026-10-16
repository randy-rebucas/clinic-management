// Automatic Invoice Generation Automation
// Generates invoices automatically when visits are completed

import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import Visit from '@/models/Visit';
import Service from '@/models/Service';
import { getSettings } from '@/lib/settings';
import { calculateDiscounts, DiscountEligibility } from '@/lib/discount-calculator';
import { createNotification } from '@/lib/notifications';
import { sendEmail, escapeHtml } from '@/lib/email';
import { escapeRegex } from '@/lib/api/validate';
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
    const defaultConsultationFee = (settings.billingSettings as any)?.defaultConsultationFee || 500;

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

    // Add consultation fee based on visit type
    const consultationService = await Service.findOne({
      tenantId,
      category: 'consultation',
      active: true,
      $or: [
        { type: visit.visitType },
        { name: { $regex: escapeRegex(String(visit.visitType || '')), $options: 'i' } }
      ]
    }).sort({ unitPrice: -1 }); // Get most expensive if multiple

    if (consultationService) {
      items.push({
        serviceId: consultationService._id,
        code: consultationService.code,
        description: consultationService.name,
        category: 'consultation',
        quantity: 1,
        unitPrice: consultationService.unitPrice,
        total: consultationService.unitPrice,
      });
    } else {
      // Fallback: use default consultation fee from settings
      items.push({
        code: 'CONSULT',
        description: `${visit.visitType} Consultation`,
        category: 'consultation',
        quantity: 1,
        unitPrice: defaultConsultationFee,
        total: defaultConsultationFee,
      });
    }

    // Add procedures if any
    if (visit.proceduresPerformed && visit.proceduresPerformed.length > 0) {
      // Note: This would require Procedure model to have service references
      // For now, we'll add a placeholder
      // TODO: Populate procedures and get their service codes/prices
    }

    // Calculate subtotal
    const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);

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

    const discounts = calculateDiscounts(subtotal, eligibility, patient.dateOfBirth);
    
    // Apply discounts (typically only the highest one, but we'll apply all)
    const discountTotal = discounts.reduce((sum, disc) => sum + disc.amount, 0);
    const afterDiscount = subtotal - discountTotal;
    
    // Get tax rate from settings
    const taxRate = settings.billingSettings?.taxRate || 0;
    const tax = afterDiscount * (taxRate / 100);
    const total = afterDiscount + tax;

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
      items,
      subtotal,
      discounts: discounts.map(disc => ({
        type: disc.type,
        reason: disc.reason,
        percentage: disc.percentage,
        amount: disc.amount,
        appliedBy: options.createdBy || visit.provider?._id,
      })),
      tax,
      total,
      outstandingBalance: total,
      totalPaid: 0,
      status: 'unpaid',
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

