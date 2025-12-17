/**
 * Insurance Verification Automation
 * Automatically verifies patient insurance eligibility
 */

import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import logger from '@/lib/logger';
import { Types } from 'mongoose';

export interface InsuranceVerificationResult {
  verified: boolean;
  insuranceProvider?: string;
  policyNumber?: string;
  coverageDetails?: {
    coverageType?: string;
    coverageAmount?: number;
    copay?: number;
    deductible?: number;
    effectiveDate?: Date;
    expirationDate?: Date;
  };
  errors?: string[];
  verifiedAt?: Date;
}

/**
 * Verify insurance for a patient
 * This is a placeholder implementation - integrate with actual insurance API
 */
export async function verifyInsurance(
  patientId: string | Types.ObjectId,
  tenantId: string | Types.ObjectId
): Promise<InsuranceVerificationResult> {
  try {
    await connectDB();

    const patient = await Patient.findOne({
      _id: patientId,
      tenantId: typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId,
    }).select('insurance firstName lastName email phone');

    if (!patient) {
      return {
        verified: false,
        errors: ['Patient not found'],
      };
    }

    // Check if patient has insurance information
    if (!patient.insurance || !patient.insurance.provider || !patient.insurance.policyNumber) {
      return {
        verified: false,
        errors: ['Patient does not have insurance information'],
      };
    }

    // TODO: Integrate with actual insurance verification API
    // This is a placeholder that simulates verification
    const insuranceProvider = patient.insurance.provider;
    const policyNumber = patient.insurance.policyNumber;

    // Simulate API call (replace with actual integration)
    const verificationResult = await simulateInsuranceVerification(
      insuranceProvider,
      policyNumber,
      patient
    );

    // Update patient record with verification status
    if (verificationResult.verified) {
      patient.insurance = {
        ...patient.insurance,
        verified: true,
        verifiedAt: new Date(),
        coverageDetails: verificationResult.coverageDetails,
      };
      await patient.save();
    }

    return verificationResult;
  } catch (error: any) {
    logger.error('Error verifying insurance', error as Error, { patientId, tenantId });
    return {
      verified: false,
      errors: [error.message || 'Failed to verify insurance'],
    };
  }
}

/**
 * Simulate insurance verification (replace with actual API integration)
 */
async function simulateInsuranceVerification(
  provider: string,
  policyNumber: string,
  patient: any
): Promise<InsuranceVerificationResult> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Simulate verification logic
  // In production, this would call an actual insurance verification API
  // Examples: Availity, Change Healthcare, Experian Health, etc.

  // For now, simulate a successful verification
  const isVerified = policyNumber.length >= 8; // Simple validation

  if (!isVerified) {
    return {
      verified: false,
      insuranceProvider: provider,
      policyNumber,
      errors: ['Invalid policy number format'],
    };
  }

  return {
    verified: true,
    insuranceProvider: provider,
    policyNumber,
    coverageDetails: {
      coverageType: 'Primary',
      coverageAmount: 10000,
      copay: 20,
      deductible: 500,
      effectiveDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
      expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
    },
    verifiedAt: new Date(),
  };
}

/**
 * Auto-verify insurance for appointments
 * Called when appointment is created or updated
 */
export async function autoVerifyInsuranceForAppointment(
  appointmentId: string | Types.ObjectId,
  tenantId: string | Types.ObjectId
): Promise<InsuranceVerificationResult | null> {
  try {
    await connectDB();

    const settings = await getSettings(tenantId.toString());
    if (!settings?.automationSettings?.autoInsuranceVerification) {
      return null; // Feature disabled
    }

    const appointment = await Appointment.findById(appointmentId).select('patient');
    if (!appointment || !appointment.patient) {
      return null;
    }

    const result = await verifyInsurance(appointment.patient, tenantId);

    // Send notification if verification failed
    if (!result.verified) {
      const patient = await Patient.findById(appointment.patient).select('firstName lastName email phone');
      if (patient) {
        const message = `Insurance verification failed for your appointment. Please contact the clinic to update your insurance information.`;
        
        // Send in-app notification
        await createNotification({
          userId: patient._id as any,
          tenantId: typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId,
          type: 'appointment',
          priority: 'normal',
          title: 'Insurance Verification Failed',
          message,
          actionUrl: `/appointments/${appointmentId}`,
        });

        // Send email if available
        if (patient.email) {
          await sendEmail({
            to: patient.email,
            subject: 'Insurance Verification Required',
            html: `
              <p>Dear ${patient.firstName} ${patient.lastName},</p>
              <p>We were unable to verify your insurance information for your upcoming appointment.</p>
              <p>Please contact our office to update your insurance details.</p>
              <p>Errors: ${result.errors?.join(', ') || 'Unknown error'}</p>
            `,
          });
        }
      }
    }

    return result;
  } catch (error: any) {
    logger.error('Error in auto insurance verification', error as Error, { appointmentId, tenantId });
    return null;
  }
}

/**
 * Batch verify insurance for multiple patients
 * Useful for periodic verification or before appointments
 */
export async function batchVerifyInsurance(
  patientIds: (string | Types.ObjectId)[],
  tenantId: string | Types.ObjectId
): Promise<{
  success: boolean;
  verified: number;
  failed: number;
  results: InsuranceVerificationResult[];
}> {
  try {
    await connectDB();

    const results: InsuranceVerificationResult[] = [];
    let verified = 0;
    let failed = 0;

    for (const patientId of patientIds) {
      try {
        const result = await verifyInsurance(patientId, tenantId);
        results.push(result);
        if (result.verified) {
          verified++;
        } else {
          failed++;
        }
      } catch (error: any) {
        logger.error('Error verifying insurance for patient', error as Error, { patientId });
        failed++;
        results.push({
          verified: false,
          errors: [error.message || 'Verification failed'],
        });
      }
    }

    return {
      success: true,
      verified,
      failed,
      results,
    };
  } catch (error: any) {
    logger.error('Error in batch insurance verification', error as Error, { tenantId });
    return {
      success: false,
      verified: 0,
      failed: patientIds.length,
      results: [],
    };
  }
}

/**
 * Verify insurance for upcoming appointments
 * Cron job to verify insurance before appointments
 */
export async function verifyInsuranceForUpcomingAppointments(
  tenantId?: string | Types.ObjectId
): Promise<{
  success: boolean;
  appointmentsChecked: number;
  verified: number;
  failed: number;
}> {
  try {
    await connectDB();

    const settings = await getSettings(tenantId?.toString());
    if (!settings?.automationSettings?.autoInsuranceVerification) {
      return {
        success: true,
        appointmentsChecked: 0,
        verified: 0,
        failed: 0,
      };
    }

    // Find appointments in the next 24-48 hours that haven't had insurance verified
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);
    dayAfter.setHours(23, 59, 59, 999);

    const query: any = {
      date: { $gte: tomorrow, $lte: dayAfter },
      status: { $in: ['scheduled', 'confirmed'] },
    };

    if (tenantId) {
      query.tenantId = typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId;
    }

    const appointments = await Appointment.find(query)
      .select('patient')
      .populate('patient', 'insurance')
      .lean();

    let verified = 0;
    let failed = 0;

    for (const appointment of appointments) {
      if (appointment.patient && (appointment.patient as any).insurance) {
        const appointmentId = appointment._id?.toString() || appointment._id;
        const result = await autoVerifyInsuranceForAppointment(
          appointmentId as string | Types.ObjectId,
          (appointment as any).tenantId || tenantId!
        );
        if (result?.verified) {
          verified++;
        } else if (result && !result.verified) {
          failed++;
        }
      }
    }

    return {
      success: true,
      appointmentsChecked: appointments.length,
      verified,
      failed,
    };
  } catch (error: any) {
    logger.error('Error verifying insurance for upcoming appointments', error as Error, { tenantId });
    return {
      success: false,
      appointmentsChecked: 0,
      verified: 0,
      failed: 0,
    };
  }
}

