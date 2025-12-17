// Visit Summary Automation
// Sends visit summaries automatically after visits are completed

import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Prescription from '@/models/Prescription';
import LabResult from '@/models/LabResult';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

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

    const settings = await getSettings();
    const autoVisitSummaries = (settings.automationSettings as any)?.autoVisitSummaries !== false;

    if (!autoVisitSummaries) {
      return { success: true, sent: false };
    }

    const visitId = typeof options.visitId === 'string' 
      ? new Types.ObjectId(options.visitId) 
      : options.visitId;

    const visit = await Visit.findById(visitId)
      .populate('patient', 'firstName lastName email phone')
      .populate('provider', 'name')
      .populate('prescriptions')
      .populate('labsOrdered');

    if (!visit) {
      return { success: false, sent: false, error: 'Visit not found' };
    }

    // Only send summary for closed visits
    if (visit.status !== 'closed') {
      return { success: true, sent: false };
    }

    const patient = visit.patient as any;
    if (!patient) {
      return { success: false, sent: false, error: 'Patient not found' };
    }

    const tenantId = options.tenantId 
      ? (typeof options.tenantId === 'string' ? new Types.ObjectId(options.tenantId) : options.tenantId)
      : visit.tenantId;

    // Get prescriptions and lab results
    const prescriptions = await Prescription.find({
      visit: visitId,
      tenantId,
    });

    const labResults = await LabResult.find({
      visit: visitId,
      tenantId,
    });

    const summaryMessage = generateSummarySMS(visit, prescriptions, labResults);
    const emailContent = generateSummaryEmail(visit, prescriptions, labResults, settings);

    let sent = false;

    // Send SMS if enabled and phone available
    if (options.sendSMS !== false && patient.phone) {
      try {
        let phoneNumber = patient.phone.trim();
        if (!phoneNumber.startsWith('+')) {
          phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
        }

        const smsResult = await sendSMS({
          to: phoneNumber,
          message: summaryMessage,
        });

        if (smsResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending visit summary SMS:', error);
      }
    }

    // Send email if enabled and email available
    if (options.sendEmail !== false && patient.email) {
      try {
        const emailResult = await sendEmail({
          to: patient.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });

        if (emailResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending visit summary email:', error);
      }
    }

    // Send in-app notification
    if (options.sendNotification !== false && patient._id) {
      try {
        await createNotification({
          userId: patient._id,
          tenantId,
          type: 'visit',
          priority: 'normal',
          title: 'Visit Summary Available',
          message: `Your visit summary for ${new Date(visit.date).toLocaleDateString()} is now available.`,
          relatedEntity: {
            type: 'visit',
            id: visit._id,
          },
          actionUrl: `/visits/${visit._id}`,
        });
        sent = true;
      } catch (error) {
        console.error('Error creating visit summary notification:', error);
      }
    }

    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending visit summary:', error);
    return { 
      success: false,
      sent: false,
      error: error.message || 'Failed to send visit summary' 
    };
  }
}

/**
 * Generate visit summary SMS
 */
function generateSummarySMS(visit: any, prescriptions: any[], labResults: any[]): string {
  const visitDate = new Date(visit.date).toLocaleDateString();
  const diagnoses = visit.diagnoses?.map((d: any) => d.description || d.code).join(', ') || 'N/A';
  
  let message = `Visit Summary (${visitDate}): Diagnosis: ${diagnoses}. `;
  
  if (prescriptions.length > 0) {
    message += `Prescriptions: ${prescriptions.length}. `;
  }
  
  if (labResults.length > 0) {
    message += `Lab tests ordered: ${labResults.length}. `;
  }
  
  if (visit.followUpDate) {
    message += `Follow-up: ${new Date(visit.followUpDate).toLocaleDateString()}. `;
  }
  
  message += 'Full details sent via email.';
  
  return message;
}

/**
 * Generate visit summary email
 */
function generateSummaryEmail(visit: any, prescriptions: any[], labResults: any[], settings: any): { subject: string; html: string } {
  const patient = visit.patient as any;
  const provider = visit.provider as any;
  const visitDate = new Date(visit.date).toLocaleDateString();
  const clinicName = settings.clinicName || 'Clinic';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';

  const subject = `Visit Summary - ${visitDate} - ${clinicName}`;

  const diagnoses = visit.diagnoses || [];
  const chiefComplaint = visit.chiefComplaint || 'N/A';
  const assessment = visit.assessment || visit.soapNotes?.assessment || 'N/A';
  const plan = visit.plan || visit.soapNotes?.plan || 'N/A';

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
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          <p>Here is a summary of your visit:</p>
          
          <div class="section">
            <h2>Visit Information</h2>
            <p><strong>Date:</strong> ${visitDate}</p>
            <p><strong>Visit Code:</strong> ${visit.visitCode}</p>
            ${provider ? `<p><strong>Provider:</strong> ${provider.name || `${provider.firstName} ${provider.lastName}`}</p>` : ''}
            <p><strong>Visit Type:</strong> ${visit.visitType || 'Consultation'}</p>
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
                  <li>${d.description || d.code || 'N/A'}${d.code ? ` (${d.code})` : ''}</li>
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
                    <strong>${prescription.prescriptionCode}</strong>
                    ${prescription.medications?.map((med: any) => med.name).join(', ') || 'No medications'}
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
                  <li>${lab.request?.testType || 'Lab Test'} - ${lab.requestCode || 'N/A'}</li>
                `).join('')}
              </ul>
              <p><a href="${baseUrl}/lab-results">View Lab Results</a></p>
            </div>
          ` : ''}

          ${visit.followUpDate ? `
            <div class="section">
              <h2>Follow-up</h2>
              <p><strong>Follow-up Date:</strong> ${new Date(visit.followUpDate).toLocaleDateString()}</p>
              ${visit.treatmentPlan?.followUp?.instructions ? `<p>${visit.treatmentPlan.followUp.instructions}</p>` : ''}
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

          <p style="text-align: center; margin-top: 20px;">
            <a href="${baseUrl}/visits/${visit._id}" style="display: inline-block; padding: 12px 24px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px;">View Full Visit Details</a>
          </p>
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

