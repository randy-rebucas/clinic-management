// Prescription Expiry Warnings Automation
// Alerts patients before prescriptions expire

import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import Patient from '@/models/Patient';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { Types } from 'mongoose';

export interface PrescriptionExpiryWarning {
  prescriptionId: Types.ObjectId;
  prescription: any;
  patient: any;
  expiryDate: Date;
  daysUntilExpiry: number;
  warningLevel: 'urgent' | 'warning' | 'reminder';
}

/**
 * Calculate prescription expiry date from issued date and duration
 */
function calculateExpiryDate(prescription: any): Date | null {
  const issuedAt = prescription.issuedAt;
  if (!issuedAt) return null;
  
  // Get maximum duration from medications
  let maxDuration = 0;
  if (prescription.medications && Array.isArray(prescription.medications)) {
    for (const med of prescription.medications) {
      if (med.durationDays && med.durationDays > maxDuration) {
        maxDuration = med.durationDays;
      }
    }
  }
  
  if (maxDuration === 0) {
    // Default to 30 days if no duration specified
    maxDuration = 30;
  }
  
  const expiryDate = new Date(issuedAt);
  expiryDate.setDate(expiryDate.getDate() + maxDuration);
  
  return expiryDate;
}

/**
 * Determine warning level based on days until expiry
 */
function determineWarningLevel(
  daysUntilExpiry: number,
  isControlledSubstance: boolean = false
): 'urgent' | 'warning' | 'reminder' {
  if (isControlledSubstance) {
    if (daysUntilExpiry <= 7) return 'urgent';
    if (daysUntilExpiry <= 14) return 'warning';
    return 'reminder';
  }
  
  // Regular medications
  if (daysUntilExpiry <= 14) return 'urgent';
  if (daysUntilExpiry <= 30) return 'warning';
  return 'reminder';
}

/**
 * Check if medication is a controlled substance (simplified check)
 */
function isControlledSubstance(medication: any): boolean {
  // Common controlled substances (simplified - should use a database)
  const controlledSubstances = [
    'oxycodone', 'morphine', 'codeine', 'fentanyl', 'methadone',
    'buprenorphine', 'diazepam', 'alprazolam', 'lorazepam', 'temazepam',
    'methylphenidate', 'amphetamine', 'adderall', 'ritalin',
  ];
  
  const name = (medication.name || '').toLowerCase();
  const genericName = (medication.genericName || '').toLowerCase();
  
  return controlledSubstances.some(substance => 
    name.includes(substance) || genericName.includes(substance)
  );
}

/**
 * Send expiry warning to patient
 */
async function sendExpiryWarning(
  warning: PrescriptionExpiryWarning,
  tenantId?: Types.ObjectId
): Promise<{ sent: boolean; error?: string }> {
  try {
    const patient = warning.patient;
    if (!patient) {
      return { sent: false, error: 'Patient not found' };
    }
    
    const prescription = warning.prescription;
    const prescriptionCode = prescription.prescriptionCode || 'N/A';
    const medications = prescription.medications || [];
    const medicationNames = medications.map((m: any) => m.name || 'Unknown').join(', ');
    
    let message = '';
    let subject = '';
    
    if (warning.warningLevel === 'urgent') {
      subject = `URGENT: Prescription Expiring Soon - ${prescriptionCode}`;
      message = `URGENT: Your prescription (${prescriptionCode}) will expire in ${warning.daysUntilExpiry} day(s). `;
      message += `Please contact the clinic to refill: ${medicationNames}`;
    } else if (warning.warningLevel === 'warning') {
      subject = `Prescription Expiring Soon - ${prescriptionCode}`;
      message = `Your prescription (${prescriptionCode}) will expire in ${warning.daysUntilExpiry} day(s). `;
      message += `Please contact the clinic to refill: ${medicationNames}`;
    } else {
      subject = `Prescription Expiry Reminder - ${prescriptionCode}`;
      message = `Reminder: Your prescription (${prescriptionCode}) will expire in ${warning.daysUntilExpiry} day(s). `;
      message += `Medications: ${medicationNames}`;
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
          message,
        });
        
        if (smsResult.success) {
          sent = true;
        }
      } catch (error) {
        console.error('Error sending prescription expiry SMS:', error);
      }
    }
    
    // Send email if available
    if (patient.email) {
      try {
        const emailHtml = `
          <h2>${subject}</h2>
          <p>Dear ${patient.firstName} ${patient.lastName},</p>
          <p>${message}</p>
          <p><strong>Prescription Code:</strong> ${prescriptionCode}</p>
          <p><strong>Medications:</strong> ${medicationNames}</p>
          <p><strong>Expiry Date:</strong> ${warning.expiryDate.toLocaleDateString()}</p>
          <p>Please contact the clinic to schedule a refill if needed.</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/prescriptions/${prescription._id}">View Prescription</a></p>
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
        console.error('Error sending prescription expiry email:', error);
      }
    }
    
    // Send in-app notification if patient has account
    if (patient._id) {
      try {
        await createNotification({
          userId: patient._id,
          tenantId,
          type: 'prescription',
          priority: warning.warningLevel === 'urgent' ? 'urgent' : 'normal',
          title: subject,
          message,
          relatedEntity: {
            type: 'prescription',
            id: prescription._id,
          },
          actionUrl: `/prescriptions/${prescription._id}`,
        }).catch(console.error);
        
        sent = true;
      } catch (error) {
        console.error('Error creating prescription expiry notification:', error);
      }
    }
    
    return { sent };
  } catch (error: any) {
    console.error('Error sending prescription expiry warning:', error);
    return { sent: false, error: error.message };
  }
}

/**
 * Process prescriptions and send expiry warnings
 * This should be called by a cron job
 */
export async function processPrescriptionExpiryWarnings(
  tenantId?: string | Types.ObjectId
): Promise<{
  success: boolean;
  processed: number;
  warningsSent: number;
  errors: number;
  warnings: PrescriptionExpiryWarning[];
}> {
  try {
    await connectDB();
    
    const settings = await getSettings();
    const autoPrescriptionExpiryWarnings = (settings.automationSettings as any)?.autoPrescriptionExpiryWarnings !== false;
    
    if (!autoPrescriptionExpiryWarnings) {
      return {
        success: true,
        processed: 0,
        warningsSent: 0,
        errors: 0,
        warnings: [],
      };
    }
    
    // Find active prescriptions
    const query: any = {
      status: { $in: ['active', 'dispensed', 'partially-dispensed'] },
    };
    
    if (tenantId) {
      query.tenantId = typeof tenantId === 'string'
        ? new Types.ObjectId(tenantId)
        : tenantId;
    }
    
    const prescriptions = await Prescription.find(query)
      .populate('patient', 'firstName lastName email phone')
      .populate('prescribedBy', 'name');
    
    const warnings: PrescriptionExpiryWarning[] = [];
    const now = new Date();
    
    // Check each prescription for expiry
    for (const prescription of prescriptions) {
      const expiryDate = calculateExpiryDate(prescription);
      if (!expiryDate) continue;
      
      // Only warn if expiry is in the future
      if (expiryDate <= now) continue;
      
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      // Warn if expiring within 30 days for regular, 14 days for controlled substances
      const medications = prescription.medications || [];
      const hasControlledSubstance = medications.some((med: any) => isControlledSubstance(med));
      
      const maxWarningDays = hasControlledSubstance ? 14 : 30;
      
      if (daysUntilExpiry <= maxWarningDays) {
        const warningLevel = determineWarningLevel(daysUntilExpiry, hasControlledSubstance);
        
        warnings.push({
          prescriptionId: prescription._id,
          prescription,
          patient: prescription.patient,
          expiryDate,
          daysUntilExpiry,
          warningLevel,
        });
      }
    }
    
    // Send warnings
    let warningsSent = 0;
    let errors = 0;
    
    for (const warning of warnings) {
      // Check if warning was already sent (prevent duplicate warnings)
      // TODO: Track sent warnings in prescription model or separate tracking table
      
      const result = await sendExpiryWarning(
        warning,
        tenantId ? (typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId) : undefined
      );
      
      if (result.sent) {
        warningsSent++;
      } else if (result.error) {
        errors++;
      }
    }
    
    return {
      success: true,
      processed: prescriptions.length,
      warningsSent,
      errors,
      warnings,
    };
  } catch (error: any) {
    console.error('Error processing prescription expiry warnings:', error);
    return {
      success: false,
      processed: 0,
      warningsSent: 0,
      errors: 1,
      warnings: [],
    };
  }
}
