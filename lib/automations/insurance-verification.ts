/**
 * Insurance Verification Automation
 * Automatically verifies patient insurance eligibility
 */

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getPatientById, updatePatient } from '@/lib/data/patient';
import { getAppointmentById, listAppointments, buildAppointmentWhere } from '@/lib/data/appointment';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import logger from '@/lib/logger';

function run<T>(tenantId: any, fn: () => T | Promise<T>): T | Promise<T> {
  const tid = tenantId ? String(tenantId) : null;
  return tid ? runWithTenant(tid, fn) : runAsSystem(fn);
}

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
  patientId: any,
  tenantId: any
): Promise<InsuranceVerificationResult> {
  try {
    return await run(tenantId, async () => {
      const patientIdStr = String(patientId);
      const patient = await getPatientById(patientIdStr);

      if (!patient) {
        return {
          verified: false,
          errors: ['Patient not found'],
        };
      }

      const insurance = (patient as any).insurance;
      // Check if patient has insurance information
      if (!insurance || !insurance.provider || !insurance.policyNumber) {
        return {
          verified: false,
          errors: ['Patient does not have insurance information'],
        };
      }

      // TODO: Integrate with actual insurance verification API
      // This is a placeholder that simulates verification
      const insuranceProvider = insurance.provider;
      const policyNumber = insurance.policyNumber;

      // Simulate API call (replace with actual integration)
      const verificationResult = await simulateInsuranceVerification(
        insuranceProvider,
        policyNumber
      );

      // Update patient record with verification status
      if (verificationResult.verified) {
        await updatePatient(patientIdStr, {
          insurance: {
            ...insurance,
            verified: true,
            verifiedAt: new Date(),
            coverageDetails: verificationResult.coverageDetails,
          },
        } as any);
      }

      return verificationResult;
    });
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
  policyNumber: string
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
  appointmentId: string,
  tenantId: any
): Promise<InsuranceVerificationResult | null> {
  try {
    return await run(tenantId, async () => {
      const settings = await getSettings(tenantId ? String(tenantId) : undefined);
      if (!settings?.automationSettings?.autoInsuranceVerification) {
        return null; // Feature disabled
      }

      const appointment = await getAppointmentById(appointmentId);
      if (!appointment || !(appointment as any).patientId) {
        return null;
      }

      const result = await verifyInsurance((appointment as any).patientId, tenantId);

      // Send notification if verification failed
      if (!result.verified) {
        const patient = await getPatientById((appointment as any).patientId);
        if (patient) {
          const message = `Insurance verification failed for your appointment. Please contact the clinic to update your insurance information.`;

          // Send in-app notification
          await createNotification({
            userId: (patient as any).id,
            tenantId: tenantId ? String(tenantId) : undefined,
            type: 'appointment',
            priority: 'normal',
            title: 'Insurance Verification Failed',
            message,
            actionUrl: `/appointments/${appointmentId}`,
          });

          // Send email if available
          if ((patient as any).email) {
            await sendEmail({
              to: (patient as any).email,
              subject: 'Insurance Verification Required',
              html: `
                <p>Dear ${(patient as any).firstName} ${(patient as any).lastName},</p>
                <p>We were unable to verify your insurance information for your upcoming appointment.</p>
                <p>Please contact our office to update your insurance details.</p>
                <p>Errors: ${result.errors?.join(', ') || 'Unknown error'}</p>
              `,
            });
          }
        }
      }

      return result;
    });
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
  patientIds: any[],
  tenantId: any
): Promise<{
  success: boolean;
  verified: number;
  failed: number;
  results: InsuranceVerificationResult[];
}> {
  try {
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
  tenantId?: any
): Promise<{
  success: boolean;
  appointmentsChecked: number;
  verified: number;
  failed: number;
}> {
  try {
    return await run(tenantId, async () => {
      const settings = await getSettings(tenantId ? String(tenantId) : undefined);
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

      const appointments = await listAppointments({
        appointmentDate: { gte: tomorrow, lte: dayAfter },
        status: { in: ['scheduled', 'confirmed'] },
      } as any);

      let verified = 0;
      let failed = 0;

      for (const appointment of appointments) {
        if ((appointment as any).patientId) {
          const result = await autoVerifyInsuranceForAppointment((appointment as any).id, tenantId);
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
    });
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
