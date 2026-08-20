// Document Expiration Tracking Automation
// Tracks and alerts on expiring insurance cards, IDs, certificates, etc.

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listDocumentsExpiringInRange } from '@/lib/data/document';
import { listActiveUsersByRoleNames } from '@/lib/data/user';
import { getAutomationSettings } from '@/lib/data/settings';
import { createNotification } from '@/lib/data/notification';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export interface DocumentExpiryAlert {
  documentId: string;
  document: any;
  patient?: any;
  expiryDate: Date;
  daysUntilExpiry: number;
  warningLevel: 'urgent' | 'warning' | 'reminder';
  documentType: string;
}

/**
 * Determine warning level based on document type and days until expiry
 */
function determineWarningLevel(
  daysUntilExpiry: number,
  documentType: string,
  category: string
): 'urgent' | 'warning' | 'reminder' {
  // Insurance and ID documents are critical
  const criticalTypes = ['insurance', 'id'];

  if (criticalTypes.includes(category) || criticalTypes.includes(documentType)) {
    if (daysUntilExpiry <= 30) return 'urgent';
    if (daysUntilExpiry <= 60) return 'warning';
    if (daysUntilExpiry <= 90) return 'reminder';
  }

  // Medical certificates
  if (category === 'medical_certificate') {
    if (daysUntilExpiry <= 7) return 'urgent';
    if (daysUntilExpiry <= 14) return 'warning';
    return 'reminder';
  }

  // Other documents
  if (daysUntilExpiry <= 14) return 'urgent';
  if (daysUntilExpiry <= 30) return 'warning';
  return 'reminder';
}

/**
 * Get document display name
 */
function getDocumentDisplayName(document: any): string {
  if (document.title) return document.title;
  if (document.category) {
    const categoryMap: Record<string, string> = {
      'insurance': 'Insurance Card',
      'id': 'ID Document',
      'medical_certificate': 'Medical Certificate',
      'referral': 'Referral Letter',
      'laboratory_result': 'Laboratory Result',
      'imaging': 'Imaging Report',
      'prescription': 'Prescription',
      'invoice': 'Invoice',
      'other': 'Document',
    };
    return categoryMap[document.category] || document.category;
  }
  return 'Document';
}

/**
 * Send expiry alert to patient and clinic
 */
async function sendDocumentExpiryAlert(
  alert: DocumentExpiryAlert,
  tenantId: string | null
): Promise<{ sent: boolean; error?: string }> {
  try {
    const document = alert.document;
    const documentName = getDocumentDisplayName(document);
    const documentCode = document.documentCode || 'N/A';

    let message = '';
    let subject = '';

    if (alert.warningLevel === 'urgent') {
      subject = `URGENT: ${documentName} Expiring Soon`;
      message = `URGENT: Your ${documentName} (${documentCode}) will expire in ${alert.daysUntilExpiry} day(s) on ${alert.expiryDate.toLocaleDateString()}. `;
      message += `Please renew this document as soon as possible.`;
    } else if (alert.warningLevel === 'warning') {
      subject = `${documentName} Expiring Soon`;
      message = `Your ${documentName} (${documentCode}) will expire in ${alert.daysUntilExpiry} day(s) on ${alert.expiryDate.toLocaleDateString()}. `;
      message += `Please arrange for renewal.`;
    } else {
      subject = `${documentName} Expiry Reminder`;
      message = `Reminder: Your ${documentName} (${documentCode}) will expire in ${alert.daysUntilExpiry} day(s) on ${alert.expiryDate.toLocaleDateString()}.`;
    }

    let sent = false;

    // Send to patient if available
    if (alert.patient) {
      const patient = alert.patient;

      // Send SMS if available
      if (patient.phone) {
        try {
          let phoneNumber = String(patient.phone).trim();
          if (!phoneNumber.startsWith('+')) {
            phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
          }

          const smsResult = await sendSMS({ to: phoneNumber, message });

          if (smsResult.success) {
            sent = true;
          }
        } catch (error) {
          console.error('Error sending document expiry SMS:', error);
        }
      }

      // Send email if available
      if (patient.email) {
        try {
          const emailHtml = `
            <h2>${subject}</h2>
            <p>Dear ${patient.firstName} ${patient.lastName},</p>
            <p>${message}</p>
            <p><strong>Document:</strong> ${documentName}</p>
            <p><strong>Document Code:</strong> ${documentCode}</p>
            <p><strong>Expiry Date:</strong> ${alert.expiryDate.toLocaleDateString()}</p>
            <p><strong>Days Remaining:</strong> ${alert.daysUntilExpiry}</p>
            <p>Please contact the clinic to renew this document if needed.</p>
          `;

          const emailResult = await sendEmail({ to: patient.email, subject, html: emailHtml });

          if (emailResult.success) {
            sent = true;
          }
        } catch (error) {
          console.error('Error sending document expiry email:', error);
        }
      }

      // In-app notification: skipped — Notification.userId is a hard FK to
      // User and patients have no linked User account.
    }

    // Also notify clinic staff (admin/receptionist) for critical documents
    if (alert.warningLevel === 'urgent' && (document.category === 'insurance' || document.category === 'id')) {
      try {
        const admins = await run(tenantId, () => listActiveUsersByRoleNames(['admin', 'receptionist']));

        for (const admin of admins) {
          try {
            await run(tenantId, () =>
              createNotification({
                userId: admin.id,
                type: 'system',
                priority: 'urgent',
                title: `Patient Document Expiring: ${alert.patient ? `${alert.patient.firstName} ${alert.patient.lastName}` : 'Unknown'}`,
                message: `${documentName} expiring in ${alert.daysUntilExpiry} days. Patient notification sent.`,
                actionUrl: `/documents/${document.id ?? document._id}`,
              })
            );
          } catch (notifyError) {
            console.error(notifyError);
          }
        }
      } catch (error) {
        console.error('Error notifying clinic staff:', error);
      }
    }

    return { sent };
  } catch (error: any) {
    console.error('Error sending document expiry alert:', error);
    return { sent: false, error: error.message };
  }
}

/**
 * Process documents and send expiry alerts
 * This should be called by a cron job
 */
export async function processDocumentExpiryTracking(
  tenantId?: string
): Promise<{
  success: boolean;
  processed: number;
  alertsSent: number;
  errors: number;
  alerts: DocumentExpiryAlert[];
}> {
  try {
    const resolvedTenantId = tenantId ?? null;

    const automationSettings = await run(resolvedTenantId, () => getAutomationSettings(resolvedTenantId));
    if (!automationSettings.autoDocumentExpiryTracking) {
      return {
        success: true,
        processed: 0,
        alertsSent: 0,
        errors: 0,
        alerts: [],
      };
    }

    // Check documents expiring within 90 days
    const now = new Date();
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

    const documents = await run(resolvedTenantId, () => listDocumentsExpiringInRange(now, ninetyDaysFromNow));

    const alerts: DocumentExpiryAlert[] = [];

    for (const document of documents) {
      const expiryDate = new Date(document.expiryDate!);
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry > 90) continue;

      const warningLevel = determineWarningLevel(
        daysUntilExpiry,
        document.documentType || '',
        document.category || ''
      );

      // Only send reminders within 30 days
      if (warningLevel === 'reminder' && daysUntilExpiry > 30) {
        continue;
      }

      alerts.push({
        documentId: document.id,
        document,
        patient: (document as any).patient,
        expiryDate,
        daysUntilExpiry,
        warningLevel,
        documentType: document.documentType || document.category || 'unknown',
      });
    }

    // Send alerts
    let alertsSent = 0;
    let errors = 0;

    for (const alert of alerts) {
      const result = await sendDocumentExpiryAlert(alert, resolvedTenantId);

      if (result.sent) {
        alertsSent++;
      } else if (result.error) {
        errors++;
      }
    }

    return {
      success: true,
      processed: documents.length,
      alertsSent,
      errors,
      alerts,
    };
  } catch (error: any) {
    console.error('Error processing document expiry tracking:', error);
    return {
      success: false,
      processed: 0,
      alertsSent: 0,
      errors: 1,
      alerts: [],
    };
  }
}
