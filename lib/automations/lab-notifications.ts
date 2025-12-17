// Lab Result Notification Automation
// Automatically notifies patients and doctors when lab results are available

import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { getSettings } from '@/lib/settings';
import { createNotification, createLabResultNotification } from '@/lib/notifications';
import { sendEmail, generateLabResultEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

export interface LabNotificationOptions {
  labResultId: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  sendSMS?: boolean;
  sendEmail?: boolean;
  sendNotification?: boolean;
}

/**
 * Send notification for lab result
 */
export async function sendLabResultNotification(options: LabNotificationOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoLabNotifications = (settings.automationSettings as any)?.autoLabNotifications !== false;

    if (!autoLabNotifications) {
      return { success: true, sent: false };
    }

    // Get lab result with populated data
    const labResultId = typeof options.labResultId === 'string' 
      ? new Types.ObjectId(options.labResultId) 
      : options.labResultId;

    const labResult = await LabResult.findById(labResultId)
      .populate('patient', 'firstName lastName email phone')
      .populate('visit', 'visitCode date')
      .populate('orderedBy', 'name email');

    if (!labResult) {
      return { success: false, sent: false, error: 'Lab result not found' };
    }

    // Check if lab result is completed
    if (labResult.status !== 'completed' && labResult.status !== 'reviewed') {
      return { success: false, sent: false, error: 'Lab result is not completed' };
    }

    // Check if already notified
    if (labResult.notificationSent) {
      return { success: true, sent: false };
    }

    const patient = labResult.patient as any;
    if (!patient) {
      return { success: false, sent: false, error: 'Patient not found' };
    }

    const tenantId = options.tenantId 
      ? (typeof options.tenantId === 'string' ? new Types.ObjectId(options.tenantId) : options.tenantId)
      : labResult.tenantId;

    let sent = false;

    // Send SMS if enabled and phone available
    if (options.sendSMS !== false && patient.phone) {
      try {
        const message = `Your lab results for ${labResult.request.testType} are now available. Request Code: ${labResult.requestCode || 'N/A'}. Please contact the clinic to view your results.`;

        let phoneNumber = patient.phone.trim();
        if (!phoneNumber.startsWith('+')) {
          phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
        }

        const smsResult = await sendSMS({
          to: phoneNumber,
          message,
        });

        if (smsResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending lab result SMS:', error);
      }
    }

    // Send email if enabled and email available
    if (options.sendEmail !== false && patient.email) {
      try {
        const emailContent = generateLabResultEmail(labResult);
        const emailResult = await sendEmail({
          to: patient.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });

        if (emailResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending lab result email:', error);
      }
    }

    // Send in-app notification to patient
    if (options.sendNotification !== false && patient._id) {
      try {
        await createLabResultNotification(patient._id, labResult);
        sent = true;
      } catch (error) {
        console.error('Error creating lab result notification:', error);
      }
    }

    // Notify ordering doctor if different from current user
    const orderedBy = labResult.orderedBy as any;
    if (orderedBy && orderedBy._id && options.sendNotification !== false) {
      try {
        await createNotification({
          userId: orderedBy._id,
          tenantId,
          type: 'lab_result',
          priority: 'normal',
          title: 'Lab Results Available',
          message: `Lab results for ${labResult.request.testType} are now available for review.`,
          relatedEntity: {
            type: 'lab_result',
            id: labResult._id,
          },
          actionUrl: `/lab-results/${labResult._id}`,
        });
      } catch (error) {
        console.error('Error notifying doctor:', error);
      }
    }

    // Update notification status
    if (sent) {
      labResult.notificationSent = true;
      labResult.notificationSentAt = new Date();
      labResult.notificationMethod = (options.sendSMS && options.sendEmail) ? 'both' : 
                                      (options.sendEmail ? 'email' : 'sms');
      await labResult.save();
    }

    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending lab result notification:', error);
    return { 
      success: false,
      sent: false,
      error: error.message || 'Failed to send lab result notification' 
    };
  }
}

/**
 * Check for abnormal/critical lab values and send urgent alerts
 */
export async function checkAbnormalLabValues(labResultId: string | Types.ObjectId): Promise<{
  hasAbnormal: boolean;
  critical: boolean;
  alertsSent: boolean;
}> {
  try {
    await connectDB();

    const labResultIdObj = typeof labResultId === 'string' 
      ? new Types.ObjectId(labResultId) 
      : labResultId;

    const labResult = await LabResult.findById(labResultIdObj)
      .populate('patient', 'firstName lastName email phone')
      .populate('orderedBy', 'name email');

    if (!labResult || !labResult.abnormalFlags) {
      return { hasAbnormal: false, critical: false, alertsSent: false };
    }

    const abnormalFlags = labResult.abnormalFlags as any;
    const hasAbnormal = Object.keys(abnormalFlags).length > 0;
    const critical = Object.values(abnormalFlags).some((flag: any) => 
      flag === 'high' || flag === 'low'
    );

    if (hasAbnormal && critical) {
      // Send urgent notification to doctor
      const orderedBy = labResult.orderedBy as any;
      if (orderedBy && orderedBy._id) {
        try {
          await createNotification({
            userId: orderedBy._id,
            tenantId: labResult.tenantId,
            type: 'lab_result',
            priority: 'urgent',
            title: 'URGENT: Abnormal Lab Results',
            message: `Lab results for ${labResult.request.testType} show abnormal/critical values. Immediate review required.`,
            relatedEntity: {
              type: 'lab_result',
              id: labResult._id,
            },
            actionUrl: `/lab-results/${labResult._id}`,
          });
          return { hasAbnormal: true, critical: true, alertsSent: true };
        } catch (error) {
          console.error('Error sending urgent lab alert:', error);
        }
      }
    }

    return { hasAbnormal, critical, alertsSent: false };
  } catch (error: any) {
    console.error('Error checking abnormal lab values:', error);
    return { hasAbnormal: false, critical: false, alertsSent: false };
  }
}

