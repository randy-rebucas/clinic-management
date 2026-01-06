// Auto-Cancellation Policies Automation
// Implements progressive actions for chronic no-shows

import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

export interface NoShowRecord {
  patientId: Types.ObjectId;
  patient: any;
  noShowCount: number;
  lastNoShowDate: Date;
  currentRestriction?: 'none' | 'deposit_required' | 'walk_in_only' | 'banned';
}

export interface CancellationPolicyResult {
  success: boolean;
  processed: number;
  restrictionsApplied: number;
  notificationsSent: number;
  errors: number;
  records: NoShowRecord[];
}

/**
 * Count no-shows for a patient within a time period
 */
async function countNoShows(
  patientId: Types.ObjectId,
  tenantId?: Types.ObjectId,
  lookbackDays: number = 365
): Promise<{ count: number; lastNoShowDate?: Date }> {
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);
  
  const query: any = {
    patient: patientId,
    status: 'no-show',
    updatedAt: { $gte: lookbackDate },
  };
  
  if (tenantId) {
    query.tenantId = typeof tenantId === 'string'
      ? new Types.ObjectId(tenantId)
      : tenantId;
  }
  
  const noShows = await Appointment.find(query)
    .sort({ updatedAt: -1 })
    .limit(10); // Get recent no-shows
  
  const lastNoShow = noShows.length > 0 ? noShows[0] : null;
  
  return {
    count: noShows.length,
    lastNoShowDate: lastNoShow ? new Date(lastNoShow.updatedAt) : undefined,
  };
}

/**
 * Determine restriction based on no-show count
 */
function determineRestriction(noShowCount: number): 'none' | 'deposit_required' | 'walk_in_only' | 'banned' {
  if (noShowCount === 0) return 'none';
  if (noShowCount === 1) return 'none'; // First no-show: warning only
  if (noShowCount === 2) return 'deposit_required'; // Second: require deposit
  if (noShowCount === 3) return 'walk_in_only'; // Third: walk-in only
  return 'banned'; // 4+: may need admin approval
}

/**
 * Apply restriction to patient record
 */
async function applyPatientRestriction(
  patientId: Types.ObjectId,
  restriction: 'none' | 'deposit_required' | 'walk_in_only' | 'banned',
  tenantId?: Types.ObjectId
): Promise<{ success: boolean; error?: string }> {
  try {
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return { success: false, error: 'Patient not found' };
    }
    
    // Store restriction in patient metadata
    // Assuming we can use a custom field or notes
    // For now, we'll use a notes field or custom metadata
    if (!(patient as any).metadata) {
      (patient as any).metadata = {};
    }
    
    (patient as any).metadata.appointmentRestriction = restriction;
    (patient as any).metadata.restrictionAppliedAt = new Date();
    
    await patient.save();
    
    return { success: true };
  } catch (error: any) {
    console.error('Error applying patient restriction:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send restriction notification to patient
 */
async function sendRestrictionNotification(
  patient: any,
  noShowCount: number,
  restriction: 'none' | 'deposit_required' | 'walk_in_only' | 'banned',
  tenantId?: Types.ObjectId
): Promise<{ sent: boolean; error?: string }> {
  try {
    let subject = '';
    let message = '';
    let priority: 'normal' | 'high' | 'urgent' = 'normal';
    
    if (restriction === 'none' && noShowCount === 1) {
      subject = 'Appointment No-Show Warning';
      message = `You missed your recent appointment. Please call to reschedule if needed. `;
      message += `Repeated no-shows may result in booking restrictions.`;
      priority = 'normal';
    } else if (restriction === 'deposit_required') {
      subject = 'Appointment Booking Restriction';
      message = `Due to multiple missed appointments (${noShowCount} no-show(s)), `;
      message += `a deposit will be required for future appointments. `;
      message += `Please contact the clinic for more information.`;
      priority = 'high';
    } else if (restriction === 'walk_in_only') {
      subject = 'Appointment Booking Restriction';
      message = `Due to repeated missed appointments (${noShowCount} no-show(s)), `;
      message += `you will need to book as a walk-in patient for future appointments. `;
      message += `Please contact the clinic if you have questions.`;
      priority = 'high';
    } else if (restriction === 'banned') {
      subject = 'Appointment Booking Restriction';
      message = `Due to multiple missed appointments (${noShowCount} no-show(s)), `;
      message += `future appointments require administrative approval. `;
      message += `Please contact the clinic to discuss booking options.`;
      priority = 'urgent';
    }
    
    let sent = false;
    
    // Send SMS if available
    if (patient.phone) {
      try {
        let phoneNumber = patient.phone.trim();
        if (!phoneNumber.startsWith('+')) {
          phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
        }
        
        const smsResult = await sendSMS({
          to: phoneNumber,
          message: `${subject}: ${message}`,
        });
        
        if (smsResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending restriction SMS:', error);
      }
    }
    
    // Send email if available
    if (patient.email) {
      try {
        const emailHtml = `
          <h2>${subject}</h2>
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          <p>${message}</p>
          <p><strong>No-Show Count:</strong> ${noShowCount}</p>
          <p><strong>Restriction:</strong> ${restriction.replace(/_/g, ' ').toUpperCase()}</p>
          <p>Please contact the clinic if you have any questions or concerns.</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/patients/${patient._id}">View Patient Portal</a></p>
        `;
        
        const emailResult = await sendEmail({
          to: patient.email,
          subject,
          html: emailHtml,
        });
        
        if (emailResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending restriction email:', error);
      }
    }
    
    // Send in-app notification if patient has account
    if (patient._id) {
      try {
        await createNotification({
          userId: patient._id,
          tenantId,
          type: 'appointment',
          priority,
          title: subject,
          message,
          relatedEntity: {
            type: 'patient',
            id: patient._id,
          },
          actionUrl: `/patients/${patient._id}`,
        }).catch(console.error);
        
        sent = true;
      } catch (error) {
        console.error('Error creating restriction notification:', error);
      }
    }
    
    // Also notify clinic staff for high-level restrictions
    if (restriction === 'walk_in_only' || restriction === 'banned') {
      try {
        const { default: User } = await import('@/models/User');
        
        const userQuery: any = {};
        if (tenantId) {
          userQuery.tenantId = tenantId;
        }
        
        const users = await User.find(userQuery)
          .populate('role')
          .exec();
        
        const staff = users.filter((user: any) => {
          const role = user.role;
          return role && (role.name === 'admin' || role.name === 'receptionist');
        });
        
        for (const staffMember of staff) {
          await createNotification({
            userId: staffMember._id,
            tenantId,
            type: 'appointment',
            priority: 'high',
            title: `Patient Appointment Restriction Applied`,
            message: `${patient.firstName} ${patient.lastName} (${noShowCount} no-shows) - ${restriction.replace(/_/g, ' ').toUpperCase()}`,
            relatedEntity: {
              type: 'patient',
              id: patient._id,
            },
            actionUrl: `/patients/${patient._id}`,
          }).catch(console.error);
        }
      } catch (error) {
        console.error('Error notifying clinic staff:', error);
      }
    }
    
    return { sent };
  } catch (error: any) {
    console.error('Error sending restriction notification:', error);
    return { sent: false, error: error.message };
  }
}

/**
 * Process patients and apply cancellation policies
 * This should be called by a cron job
 */
export async function processAutoCancellationPolicies(
  tenantId?: string | Types.ObjectId
): Promise<CancellationPolicyResult> {
  try {
    await connectDB();
    
    const settings = await getSettings();
    const autoCancellationPolicies = (settings.automationSettings as any)?.autoCancellationPolicies !== false;
    
    if (!autoCancellationPolicies) {
      return {
        success: true,
        processed: 0,
        restrictionsApplied: 0,
        notificationsSent: 0,
        errors: 0,
        records: [],
      };
    }
    
    // Normalize tenantId to ObjectId if it's a string
    const tenantIdObj = tenantId 
      ? (typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId)
      : undefined;
    
    // Find all patients with no-show appointments in the last year
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const noShowQuery: any = {
      status: 'no-show',
      updatedAt: { $gte: oneYearAgo },
    };
    
    if (tenantIdObj) {
      noShowQuery.tenantId = tenantIdObj;
    }
    
    // Get distinct patients with no-shows
    const noShowAppointments = await Appointment.find(noShowQuery)
      .populate('patient', 'firstName lastName email phone')
      .distinct('patient');
    
    const records: NoShowRecord[] = [];
    let restrictionsApplied = 0;
    let notificationsSent = 0;
    let errors = 0;
    
    // Process each patient
    for (const patientId of noShowAppointments) {
      if (!patientId) continue;
      
      const patientIdObj = typeof patientId === 'string'
        ? new Types.ObjectId(patientId)
        : patientId;
      
      const noShowInfo = await countNoShows(patientIdObj, tenantIdObj);
      
      if (noShowInfo.count === 0) continue;
      
      const patient = await Patient.findById(patientIdObj);
      if (!patient) continue;
      
      const currentRestriction = (patient as any).metadata?.appointmentRestriction || 'none';
      const restriction = determineRestriction(noShowInfo.count);
      
      // Only apply if restriction has changed or needs update
      if (restriction !== 'none' && restriction !== currentRestriction) {
        const applyResult = await applyPatientRestriction(patientIdObj, restriction, tenantIdObj);
        
        if (applyResult.success) {
          restrictionsApplied++;
        } else {
          errors++;
        }
      }
      
      // Send notification if restriction is new or count changed
      if (restriction !== currentRestriction || noShowInfo.count > 0) {
        const notificationResult = await sendRestrictionNotification(
          patient,
          noShowInfo.count,
          restriction,
          tenantIdObj
        );
        
        if (notificationResult.sent) {
          notificationsSent++;
        }
      }
      
      records.push({
        patientId: patientIdObj,
        patient: patient as any,
        noShowCount: noShowInfo.count,
        lastNoShowDate: noShowInfo.lastNoShowDate || new Date(),
        currentRestriction: restriction,
      });
    }
    
    return {
      success: true,
      processed: noShowAppointments.length,
      restrictionsApplied,
      notificationsSent,
      errors,
      records,
    };
  } catch (error: any) {
    console.error('Error processing auto-cancellation policies:', error);
    return {
      success: false,
      processed: 0,
      restrictionsApplied: 0,
      notificationsSent: 0,
      errors: 1,
      records: [],
    };
  }
}
