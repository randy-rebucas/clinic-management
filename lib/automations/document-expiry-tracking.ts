// Document Expiration Tracking Automation
// Tracks and alerts on expiring insurance cards, IDs, certificates, etc.

import connectDB from '@/lib/mongodb';
import Document from '@/models/Document';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';
import {
  forEachTenant,
  automationEnabled,
  getTenantStaff,
  safeNotify,
  delivered,
  pendingThreshold,
  daysUntilInTz,
  displayDate,
  errorMessage,
  BATCH_LIMIT,
  type AutomationTenant,
} from './shared';

export interface DocumentExpiryAlert {
  documentId: Types.ObjectId;
  document: any;
  patient?: any;
  expiryDate: Date;
  daysUntilExpiry: number;
  warningLevel: 'urgent' | 'warning' | 'reminder';
  documentType: string;
}

const CRITICAL = ['insurance', 'id'];

function isCritical(documentType: string, category: string): boolean {
  return CRITICAL.includes(category) || CRITICAL.includes(documentType);
}

/** Days-before-expiry at which an alert goes out (each sent once). */
function alertThresholds(documentType: string, category: string): number[] {
  if (isCritical(documentType, category)) return [60, 30, 7, 1];
  if (category === 'medical_certificate') return [14, 7, 1];
  return [30, 14, 1];
}

/**
 * Determine warning level based on document type and days until expiry
 */
function determineWarningLevel(
  daysUntilExpiry: number,
  documentType: string,
  category: string
): 'urgent' | 'warning' | 'reminder' {
  if (isCritical(documentType, category)) {
    if (daysUntilExpiry <= 30) return 'urgent';
    if (daysUntilExpiry <= 60) return 'warning';
    return 'reminder';
  }

  if (category === 'medical_certificate') {
    if (daysUntilExpiry <= 7) return 'urgent';
    if (daysUntilExpiry <= 14) return 'warning';
    return 'reminder';
  }

  if (daysUntilExpiry <= 14) return 'urgent';
  if (daysUntilExpiry <= 30) return 'warning';
  return 'reminder';
}

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
  tenant: AutomationTenant
): Promise<{ sent: boolean; error?: string }> {
  try {
    const document = alert.document;
    const documentName = getDocumentDisplayName(document);
    const documentCode = document.documentCode || 'N/A';
    const expiryText = displayDate(alert.expiryDate, tenant.timezone);

    let message = '';
    let subject = '';

    if (alert.warningLevel === 'urgent') {
      subject = `URGENT: ${documentName} Expiring Soon`;
      message = `URGENT: Your ${documentName} (${documentCode}) will expire in ${alert.daysUntilExpiry} day(s) on ${expiryText}. `;
      message += `Please renew this document as soon as possible.`;
    } else if (alert.warningLevel === 'warning') {
      subject = `${documentName} Expiring Soon`;
      message = `Your ${documentName} (${documentCode}) will expire in ${alert.daysUntilExpiry} day(s) on ${expiryText}. `;
      message += `Please arrange for renewal.`;
    } else {
      subject = `${documentName} Expiry Reminder`;
      message = `Reminder: Your ${documentName} (${documentCode}) will expire in ${alert.daysUntilExpiry} day(s) on ${expiryText}.`;
    }

    let sent = false;

    if (alert.patient) {
      const patient = alert.patient;

      if (patient.phone) {
        try {
          const smsResult = await sendSMS({ to: patient.phone, message });
          if (delivered(smsResult)) sent = true;
        } catch (error) {
          console.error('Error sending document expiry SMS:', error);
        }
      }

      if (patient.email) {
        try {
          const emailHtml = `
            <h2>${escapeHtml(subject)}</h2>
            <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
            <p>${escapeHtml(message)}</p>
            <p><strong>Document:</strong> ${escapeHtml(documentName)}</p>
            <p><strong>Document Code:</strong> ${escapeHtml(documentCode)}</p>
            <p><strong>Expiry Date:</strong> ${escapeHtml(expiryText)}</p>
            <p><strong>Days Remaining:</strong> ${alert.daysUntilExpiry}</p>
            <p>Please contact the clinic to renew this document if needed.</p>
          `;
          const emailResult = await sendEmail({ to: patient.email, subject, html: emailHtml });
          if (delivered(emailResult)) sent = true;
        } catch (error) {
          console.error('Error sending document expiry email:', error);
        }
      }
    }

    // Also notify clinic staff for critical documents
    if (alert.warningLevel === 'urgent' && isCritical(document.documentType || '', document.category || '')) {
      try {
        const staff = await getTenantStaff(tenant.tenantObjectId, ['admin', 'receptionist']);
        for (const admin of staff) {
          const ok = await safeNotify({
            userId: admin._id,
            tenantId: tenant.tenantObjectId,
            type: 'system',
            priority: 'urgent',
            title: `Patient Document Expiring: ${alert.patient ? `${alert.patient.firstName} ${alert.patient.lastName}` : 'Unknown'}`,
            message: `${documentName} expiring in ${alert.daysUntilExpiry} days.`,
            relatedEntity: alert.patient?._id || document.patient
              ? { type: 'patient', id: alert.patient?._id || document.patient }
              : undefined,
            actionUrl: `/documents/${document._id}`,
          });
          if (ok) sent = true;
        }
      } catch (error) {
        console.error('Error notifying clinic staff:', error);
      }
    }

    return { sent };
  } catch (error: any) {
    console.error('Error sending document expiry alert:', error);
    return { sent: false, error: errorMessage(error) };
  }
}

type TrackingResult = {
  success: boolean;
  processed: number;
  alertsSent: number;
  errors: number;
  alerts: DocumentExpiryAlert[];
};

async function processTenant(tenant: AutomationTenant): Promise<TrackingResult> {
  const out: TrackingResult = { success: true, processed: 0, alertsSent: 0, errors: 0, alerts: [] };

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoDocumentExpiryTracking')) return out;

  const now = new Date();
  const horizon = new Date(now.getTime() + 61 * 24 * 60 * 60 * 1000);

  const documents = await Document.find({
    tenantId: tenant.tenantObjectId,
    status: { $ne: 'deleted' },
    expiryDate: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000), $lte: horizon },
  })
    .sort({ expiryDate: 1 })
    .limit(BATCH_LIMIT)
    .populate('patient', 'firstName lastName email phone');

  for (const document of documents) {
    out.processed++;
    try {
      const expiryDate = new Date(document.expiryDate!);
      const daysUntilExpiry = daysUntilInTz(expiryDate, tenant.timezone, now);
      if (daysUntilExpiry < 0) continue;

      const documentType = document.documentType || '';
      const category = document.category || '';
      const due = pendingThreshold(daysUntilExpiry, alertThresholds(documentType, category), document.expiryAlertsSent);
      if (!due) continue;

      const alert: DocumentExpiryAlert = {
        documentId: document._id,
        document,
        patient: document.patient,
        expiryDate,
        daysUntilExpiry,
        warningLevel: determineWarningLevel(daysUntilExpiry, documentType, category),
        documentType: documentType || category || 'unknown',
      };

      const result = await sendDocumentExpiryAlert(alert, tenant);
      if (result.sent) {
        out.alertsSent++;
        await Document.updateOne(
          { _id: document._id, tenantId: tenant.tenantObjectId },
          { $addToSet: { expiryAlertsSent: { $each: due.crossed } } }
        );
      } else if (result.error) {
        out.errors++;
      }

      out.alerts.push({ ...alert, document: { _id: document._id, title: document.title, category } });
    } catch (error) {
      out.errors++;
      console.error('[document-expiry] document failed:', errorMessage(error));
    }
  }

  return out;
}

/**
 * Process documents and send expiry alerts.
 * Without a tenantId every active tenant is processed.
 */
export async function processDocumentExpiryTracking(
  tenantId?: string | Types.ObjectId
): Promise<TrackingResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant);
    const total: TrackingResult = { success: runs.every((r) => r.success), processed: 0, alertsSent: 0, errors: 0, alerts: [] };
    for (const run of runs) {
      if (!run.result) {
        total.errors++;
        continue;
      }
      total.processed += run.result.processed;
      total.alertsSent += run.result.alertsSent;
      total.errors += run.result.errors;
      total.alerts.push(...run.result.alerts);
    }
    return total;
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
