// Automatic Invoice Generation Automation
// Generates invoices automatically when visits are completed

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getVisitById } from '@/lib/data/visit';
import { listInvoices, buildInvoiceWhere, createInvoice, getMaxInvoiceNumber } from '@/lib/data/invoice';
import { listServices } from '@/lib/data/service';
import { getSettings } from '@/lib/settings';
import { calculateDiscounts, DiscountEligibility } from '@/lib/discount-calculator';
import { createNotification, createInvoiceNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';

function run<T>(tenantId: any, fn: () => T | Promise<T>): T | Promise<T> {
  const tid = tenantId ? String(tenantId) : null;
  return tid ? runWithTenant(tid, fn) : runAsSystem(fn);
}

export interface AutoInvoiceOptions {
  visitId: string;
  tenantId?: any;
  createdBy?: string;
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
    return await run(options.tenantId, async () => {
      const visit = await getVisitById(options.visitId);

      if (!visit) {
        return { success: false, error: 'Visit not found' };
      }

      // Check if visit is closed/completed
      if ((visit as any).status !== 'closed') {
        return {
          success: false,
          skipped: true,
          reason: 'Visit is not closed/completed'
        };
      }

      // Check if invoice already exists for this visit
      const existingInvoices = await listInvoices(buildInvoiceWhere({ visitId: options.visitId }));
      if (existingInvoices.length > 0) {
        return {
          success: false,
          skipped: true,
          reason: 'Invoice already exists for this visit',
          invoice: existingInvoices[0]
        };
      }

      const tenantId = options.tenantId ? String(options.tenantId) : (visit as any).tenantId;

      // Get settings for invoice prefix and billing configuration
      const settings = await getSettings(tenantId);
      const invoicePrefix = settings.billingSettings?.invoicePrefix || 'INV';
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
      const patient = (visit as any).patient;
      if (!patient) {
        return { success: false, error: 'Patient not found' };
      }

      // Build invoice items from visit
      const items: any[] = [];

      // Add consultation fee based on visit type
      const consultationServices = (
        await listServices({ category: 'consultation', active: true })
      ).filter((s: any) => s.type === (visit as any).visitType || (s.name || '').toLowerCase().includes(String((visit as any).visitType || '').toLowerCase()))
        .sort((a: any, b: any) => (b.unitPrice || 0) - (a.unitPrice || 0));

      const consultationService = consultationServices[0];

      if (consultationService) {
        items.push({
          serviceId: consultationService.id,
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
          description: `${(visit as any).visitType} Consultation`,
          category: 'consultation',
          quantity: 1,
          unitPrice: defaultConsultationFee,
          total: defaultConsultationFee,
        });
      }

      // Add procedures if any
      // TODO: Populate procedures and get their service codes/prices

      // Calculate subtotal
      const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);

      // Calculate discounts
      const discountEligibility = (patient as any).discountEligibility || {};
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

      const discounts = calculateDiscounts(subtotal, eligibility, (patient as any).dateOfBirth);

      const nextNumber = (await getMaxInvoiceNumber()) + 1;
      const invoiceNumber = `${invoicePrefix}-${String(nextNumber).padStart(6, '0')}`;

      const invoice = await createInvoice(
        {
          invoiceNumber,
          items,
          discounts: discounts.map((disc) => ({
            type: disc.type,
            reason: disc.reason,
            percentage: disc.percentage,
            amount: disc.amount,
            appliedBy: options.createdBy || (visit as any).providerId,
          })),
        },
        {
          patientId: patient.id,
          visitId: (visit as any).id,
          createdById: options.createdBy || (visit as any).providerId,
        }
      );

      // Send notifications
      if (options.sendNotification !== false) {
        // Notify patient
        if (patient.id) {
          await createInvoiceNotification(patient.id, invoice).catch(console.error);
        }

        // Notify provider if different from creator
        const providerId = (visit as any).providerId;
        if (providerId && providerId !== options.createdBy) {
          await createNotification({
            userId: providerId,
            tenantId,
            type: 'invoice',
            priority: 'normal',
            title: 'Invoice Generated',
            message: `Invoice ${invoiceNumber} has been generated for visit ${(visit as any).visitCode}`,
            relatedEntity: {
              type: 'invoice',
              id: (invoice as any).id,
            },
            actionUrl: `/invoices/${(invoice as any).id}`,
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
    });
  } catch (error: any) {
    console.error('Error generating invoice for visit:', error);
    return {
      success: false,
      error: error.message || 'Failed to generate invoice'
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
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          <p>Your invoice has been generated:</p>
          <div class="info-box">
            <p><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</p>
            <p><strong>Date:</strong> ${new Date(invoice.createdAt).toLocaleDateString()}</p>
            ${invoice.visit ? `<p><strong>Visit Code:</strong> ${(invoice.visit as any).visitCode}</p>` : ''}
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
                  <td>${item.description || item.code}</td>
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
                <li>${disc.reason}: ${disc.amount?.toFixed(2)}</li>
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
