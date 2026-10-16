/**
 * Insurance Verification Automation
 * Automatically verifies patient insurance eligibility
 */

import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { dayRangeOffsetInTz } from '@/lib/tz';
import logger from '@/lib/logger';
import { Types } from 'mongoose';
import { forEachTenant, getTenantTimezone, errorMessage, BATCH_LIMIT, type AutomationTenant } from './shared';

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
  /** True when the patient has no insurance on file (self-pay); not a failure. */
  noInsurance?: boolean;
}

function toObjectId(id: string | Types.ObjectId): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
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

    // Patient uses a tenantIds array. `insurance` is not a schema path, so read the raw document.
    const patient = await Patient.findOne({ _id: patientId, tenantIds: toObjectId(tenantId) })
      .select('insurance firstName lastName email phone')
      .lean<any>();

    if (!patient) {
      return {
        verified: false,
        errors: ['Patient not found'],
      };
    }

    if (!patient.insurance || !patient.insurance.provider || !patient.insurance.policyNumber) {
      return {
        verified: false,
        noInsurance: true,
        errors: ['Patient does not have insurance information'],
      };
    }

    // No eligibility provider is integrated yet; nothing is written back to the patient
    // so simulated coverage never becomes part of the record.
    return await simulateInsuranceVerification(patient.insurance.provider, String(patient.insurance.policyNumber));
  } catch (error: any) {
    logger.error('Error verifying insurance', error as Error, { patientId: String(patientId), tenantId: String(tenantId) });
    return {
      verified: false,
      errors: ['Failed to verify insurance'],
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
  const isVerified = policyNumber.length >= 8; // Simple format validation

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

    const tid = toObjectId(tenantId);
    const appointment = await Appointment.findOne({ _id: appointmentId, tenantId: tid }).select('patient insuranceCheckedAt');
    if (!appointment || !appointment.patient) {
      return null;
    }
    if ((appointment as any).insuranceCheckedAt) {
      return null;
    }

    const result = await verifyInsurance(appointment.patient, tid);

    await Appointment.updateOne({ _id: appointment._id, tenantId: tid }, { $set: { insuranceCheckedAt: new Date() } });

    // Only tell patients who actually have insurance on file that it couldn't be verified.
    if (!result.verified && !result.noInsurance) {
      const patient = await Patient.findOne({ _id: appointment.patient, tenantIds: tid }).select('firstName lastName email');
      if (patient?.email) {
        await sendEmail({
          to: patient.email,
          subject: 'Insurance Verification Required',
          html: `
            <p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
            <p>We were unable to verify your insurance information for your upcoming appointment.</p>
            <p>Please contact our office to update your insurance details.</p>
            <p>Details: ${escapeHtml(result.errors?.join(', ') || 'Unknown error')}</p>
          `,
        });
      }
    }

    return result;
  } catch (error: any) {
    logger.error('Error in auto insurance verification', error as Error, { appointmentId: String(appointmentId), tenantId: String(tenantId) });
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
        logger.error('Error verifying insurance for patient', error as Error, { patientId: String(patientId) });
        failed++;
        results.push({
          verified: false,
          errors: ['Verification failed'],
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
    logger.error('Error in batch insurance verification', error as Error, { tenantId: String(tenantId) });
    return {
      success: false,
      verified: 0,
      failed: patientIds.length,
      results: [],
    };
  }
}

type UpcomingResult = {
  success: boolean;
  appointmentsChecked: number;
  verified: number;
  failed: number;
};

async function processTenant(tenant: AutomationTenant): Promise<UpcomingResult> {
  const out: UpcomingResult = { success: true, appointmentsChecked: 0, verified: 0, failed: 0 };

  const settings = await getSettings(tenant.tenantId);
  if (!settings?.automationSettings?.autoInsuranceVerification) return out;

  const tz = tenant.timezone || (await getTenantTimezone(tenant.tenantId));
  const start = dayRangeOffsetInTz(1, new Date(), tz).start;
  const end = dayRangeOffsetInTz(2, new Date(), tz).end;

  const appointments = await Appointment.find({
    tenantId: tenant.tenantObjectId,
    appointmentDate: { $gte: start, $lte: end },
    status: { $in: ['pending', 'scheduled', 'confirmed'] },
    insuranceCheckedAt: { $exists: false },
  })
    .select('_id')
    .limit(BATCH_LIMIT)
    .lean();

  for (const appointment of appointments as any[]) {
    out.appointmentsChecked++;
    try {
      const result = await autoVerifyInsuranceForAppointment(appointment._id, tenant.tenantObjectId);
      if (result?.verified) out.verified++;
      else if (result && !result.noInsurance) out.failed++;
    } catch (error) {
      out.failed++;
      console.error('[insurance-verification] appointment failed:', errorMessage(error));
    }
  }

  return out;
}

/**
 * Verify insurance for upcoming appointments (tomorrow and the day after, clinic-local).
 * Without a tenantId every active tenant is processed.
 */
export async function verifyInsuranceForUpcomingAppointments(
  tenantId?: string | Types.ObjectId
): Promise<UpcomingResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant);
    const total: UpcomingResult = { success: runs.every((r) => r.success), appointmentsChecked: 0, verified: 0, failed: 0 };
    for (const run of runs) {
      total.appointmentsChecked += run.result?.appointmentsChecked ?? 0;
      total.verified += run.result?.verified ?? 0;
      total.failed += run.result?.failed ?? 0;
    }
    return total;
  } catch (error: any) {
    logger.error('Error verifying insurance for upcoming appointments', error as Error, { tenantId: String(tenantId ?? '') });
    return {
      success: false,
      appointmentsChecked: 0,
      verified: 0,
      failed: 0,
    };
  }
}
