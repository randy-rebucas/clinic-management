// Visit Summary Automation
// Sends visit summaries automatically after visits are completed

import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Prescription from '@/models/Prescription';
import LabResult from '@/models/LabResult';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';
import { automationEnabled, getTenantTimezone, delivered, displayDate } from './shared';

export interface VisitSummaryOptions {
  visitId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
}

/**
 * Send visit summary to patient
 */
export async function sendVisitSummary(options: VisitSummaryOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    await connectDB();

    if (!options.tenantId) {
      return { success: false, sent: false, error: 'Tenant is required' };
    }
    const tenantId = new Types.ObjectId(String(options.tenantId));

    const settings = await getSettings(tenantId.toString());
    if (!automationEnabled(settings, 'autoVisitSummaries')) {
      return { success: true, sent: false };
    }

    const visitId = new Types.ObjectId(String(options.visitId));
    const visit = await Visit.findOne({ _id: visitId, tenantId })
      .populate('patient', 'firstName lastName email phone')
      .populate('provider', 'name');

    if (!visit) {
      return { success: false, sent: false, error: 'Visit not found' };
    }
    if (visit.status !== 'closed') {
      return { success: true, sent: false };
    }

    const patient = visit.patient as any;
    if (!patient) {
      return { success: false, sent: false, error: 'Patient not found' };
    }

    const [prescriptions, labResults, tz] = await Promise.all([
      Prescription.find({ visit: visitId, tenantId }).select('prescriptionCode medications').lean(),
      LabResult.find({ visit: visitId, tenantId }).select('request requestCode').lean(),
      getTenantTimezone(tenantId),
    ]);

    let sent = false;

    // SMS is not a secure channel: it only points to the email, never carries clinical details.
    if (options.sendSMS !== false && patient.phone) {
      try {
        const clinicName = settings.clinicName || 'the clinic';
        const smsResult = await sendSMS({
          to: patient.phone,
          message: `Your visit summary from ${clinicName} (${displayDate(visit.date, tz)}) is ready.${patient.email ? ' Full details were sent to your email.' : ' Please contact the clinic for details.'}`,
        });
        if (delivered(smsResult)) sent = true;
      } catch (error) {
        console.error('Error sending visit summary SMS:', error);
      }
    }

    if (options.sendEmail !== false && patient.email) {
      try {
        const emailContent = generateSummaryEmail(visit, prescriptions as any[], labResults as any[], settings, tz);
        const emailResult = await sendEmail({ to: patient.email, subject: emailContent.subject, html: emailContent.html });
        if (delivered(emailResult)) sent = true;
      } catch (error) {
        console.error('Error sending visit summary email:', error);
      }
    }

    // Patients have no User account, so no in-app notification is created here.
    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending visit summary:', error);
    return {
      success: false,
      sent: false,
      error: 'Failed to send visit summary',
    };
  }
}

function generateSummaryEmail(
  visit: any,
  prescriptions: any[],
  labResults: any[],
  settings: any,
  tz: string
): { subject: string; html: string } {
  const patient = visit.patient as any;
  const provider = visit.provider as any;
  const visitDate = escapeHtml(displayDate(visit.date, tz));
  const clinicName = settings.clinicName || 'Clinic';
  const baseUrl = escapeHtml(process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com');

  const subject = `Visit Summary - ${displayDate(visit.date, tz)} - ${clinicName}`;

  const diagnoses = visit.diagnoses || [];
  const chiefComplaint = escapeHtml(visit.chiefComplaint || 'N/A');
  const assessment = escapeHtml(visit.assessment || visit.soapNotes?.assessment || 'N/A');
  const plan = escapeHtml(visit.plan || visit.soapNotes?.plan || 'N/A');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .section { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #2196F3; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        ul { padding-left: 20px; }
        li { margin: 5px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Visit Summary</h1>
          <p>${visitDate}</p>
        </div>
        <div class="content">
          <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
          <p>Here is a summary of your visit:</p>

          <div class="section">
            <h2>Visit Information</h2>
            <p><strong>Date:</strong> ${visitDate}</p>
            ${visit.visitCode ? `<p><strong>Visit Code:</strong> ${escapeHtml(visit.visitCode)}</p>` : ''}
            ${provider?.name ? `<p><strong>Provider:</strong> ${escapeHtml(provider.name)}</p>` : ''}
            <p><strong>Visit Type:</strong> ${escapeHtml(visit.visitType || 'Consultation')}</p>
          </div>

          <div class="section">
            <h2>Chief Complaint</h2>
            <p>${chiefComplaint}</p>
          </div>

          ${diagnoses.length > 0 ? `
            <div class="section">
              <h2>Diagnosis</h2>
              <ul>
                ${diagnoses.map((d: any) => `
                  <li>${escapeHtml(d.description || d.code || 'N/A')}${d.code ? ` (${escapeHtml(d.code)})` : ''}</li>
                `).join('')}
              </ul>
            </div>
          ` : ''}

          <div class="section">
            <h2>Assessment</h2>
            <p>${assessment}</p>
          </div>

          <div class="section">
            <h2>Treatment Plan</h2>
            <p>${plan}</p>
          </div>

          ${prescriptions.length > 0 ? `
            <div class="section">
              <h2>Prescriptions (${prescriptions.length})</h2>
              <ul>
                ${prescriptions.map((prescription: any) => `
                  <li>
                    <strong>${escapeHtml(prescription.prescriptionCode)}</strong>
                    ${escapeHtml(prescription.medications?.map((med: any) => med.name).join(', ') || 'No medications')}
                  </li>
                `).join('')}
              </ul>
              <p><a href="${baseUrl}/prescriptions">View Prescriptions</a></p>
            </div>
          ` : ''}

          ${labResults.length > 0 ? `
            <div class="section">
              <h2>Lab Tests Ordered (${labResults.length})</h2>
              <ul>
                ${labResults.map((lab: any) => `
                  <li>${escapeHtml(lab.request?.testType || 'Lab Test')} - ${escapeHtml(lab.requestCode || 'N/A')}</li>
                `).join('')}
              </ul>
              <p><a href="${baseUrl}/lab-results">View Lab Results</a></p>
            </div>
          ` : ''}

          ${visit.followUpDate ? `
            <div class="section">
              <h2>Follow-up</h2>
              <p><strong>Follow-up Date:</strong> ${escapeHtml(displayDate(visit.followUpDate, tz))}</p>
              ${visit.treatmentPlan?.followUp?.instructions ? `<p>${escapeHtml(visit.treatmentPlan.followUp.instructions)}</p>` : ''}
            </div>
          ` : ''}

          <div class="section">
            <p><strong>Next Steps:</strong></p>
            <ul>
              ${prescriptions.length > 0 ? '<li>Fill your prescriptions as directed</li>' : ''}
              ${labResults.length > 0 ? '<li>Complete any ordered lab tests</li>' : ''}
              ${visit.followUpDate ? '<li>Schedule or confirm your follow-up appointment</li>' : ''}
              <li>Contact the clinic if you have any questions or concerns</li>
            </ul>
          </div>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
          <p>If you have questions, please contact the clinic directly.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}
