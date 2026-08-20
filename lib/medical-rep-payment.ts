/**
 * Medical Representative Payment Verification Utility
 * Handles payment processing and verification for medical representative activation
 *
 * Migrated off Mongoose. MedicalRepresentative has no dedicated lib/data/*.ts
 * module yet (same precedent as app/api/medical-representatives/login/route.ts
 * from Phase 5 Batch 1 — calls prisma.medicalRepresentative directly, wrapped
 * in runWithTenant/runAsSystem, rather than a full data-access module for one
 * caller). Audit logging now goes through lib/data/audit-log.ts (Prisma) —
 * resource 'system' is used since AuditResource has no
 * 'medical_representative' member (see prisma/schema.prisma).
 */

import prisma from '@/lib/prisma';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { createAuditLogEntry, createSystemAuditLogEntry } from '@/lib/data/audit-log';

function run<T>(tenantId: string | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

async function logAudit(tenantId: string | undefined, description: string, metadata: Record<string, unknown>) {
  const input = {
    userId: 'system',
    userEmail: 'system@clinic.local',
    userRole: 'system',
    action: 'update' as const,
    resource: 'system' as const,
    description,
    metadata,
    timestamp: new Date(),
  };
  if (tenantId) {
    await createAuditLogEntry({ ...input, tenantId });
  } else {
    await createSystemAuditLogEntry(input);
  }
}

export interface PaymentVerificationRequest {
  paymentReference: string;
  paymentMethod: string;
  paymentAmount: number;
  medicalRepresentativeId?: string;
  email?: string;
  tenantId?: string;
}

export interface PaymentVerificationResponse {
  success: boolean;
  isValid: boolean;
  message: string;
  medicalRepresentativeId?: string;
  activationStatus?: string;
  error?: string;
}

/**
 * Verify and process payment for medical representative activation
 * This can be extended to integrate with actual payment gateways
 */
export async function verifyPayment(
  request: PaymentVerificationRequest
): Promise<PaymentVerificationResponse> {
  try {
    const { paymentReference, paymentMethod, paymentAmount, medicalRepresentativeId, email, tenantId } = request;

    if (!paymentReference || !paymentMethod || !paymentAmount) {
      return {
        success: false,
        isValid: false,
        message: 'Invalid payment details provided',
        error: 'Missing required payment information',
      };
    }

    const medicalRep = await run(tenantId, async () => {
      if (medicalRepresentativeId) {
        return prisma.medicalRepresentative.findUnique({ where: { id: medicalRepresentativeId } });
      } else if (email) {
        return prisma.medicalRepresentative.findFirst({ where: { email: email.toLowerCase().trim() } });
      }
      return null;
    });

    if (!medicalRep) {
      return {
        success: false,
        isValid: false,
        message: 'Medical representative not found',
        error: 'Unable to locate medical representative record',
      };
    }

    // TODO: Integrate with actual payment gateway (Stripe, PayMongo, etc.)
    const isPaymentValid = await validatePaymentWithGateway(paymentReference, paymentMethod, paymentAmount);

    if (!isPaymentValid) {
      await run(tenantId, () =>
        prisma.medicalRepresentative.update({
          where: { id: medicalRep.id },
          data: { paymentStatus: 'failed' },
        })
      );

      await logAudit(tenantId, `Payment verification failed for medical representative ${medicalRep.id}`, {
        entityType: 'MedicalRepresentative',
        entityId: medicalRep.id,
        changes: { paymentStatus: { from: 'pending', to: 'failed' } },
        reason: 'Payment verification failed',
        paymentReference,
      });

      return {
        success: false,
        isValid: false,
        message: 'Payment verification failed',
        medicalRepresentativeId: medicalRep.id,
        error: 'Payment could not be verified. Please try again.',
      };
    }

    const previousStatus = medicalRep.status;

    await run(tenantId, () =>
      prisma.medicalRepresentative.update({
        where: { id: medicalRep.id },
        data: {
          isActivated: true,
          paymentStatus: 'completed',
          paymentDate: new Date(),
          activationDate: new Date(),
          paymentReference,
          paymentMethod,
          paymentAmount,
          status: 'active',
        },
      })
    );

    await logAudit(tenantId, `Medical representative ${medicalRep.id} activated after payment verification`, {
      entityType: 'MedicalRepresentative',
      entityId: medicalRep.id,
      changes: {
        isActivated: { from: false, to: true },
        paymentStatus: { from: 'pending', to: 'completed' },
        status: { from: previousStatus, to: 'active' },
      },
      paymentReference,
      paymentMethod,
      paymentAmount,
    });

    return {
      success: true,
      isValid: true,
      message: 'Payment verified successfully. Medical representative account activated.',
      medicalRepresentativeId: medicalRep.id,
      activationStatus: 'active',
    };
  } catch (error: any) {
    console.error('Payment verification error:', error);
    return {
      success: false,
      isValid: false,
      message: 'An error occurred during payment verification',
      error: error.message,
    };
  }
}

/**
 * Validate payment with external gateway
 * This is a placeholder - integrate with actual payment provider
 */
async function validatePaymentWithGateway(
  paymentReference: string,
  paymentMethod: string,
  amount: number
): Promise<boolean> {
  try {
    const isValid = !!(paymentReference && paymentReference.length > 3 && amount > 0);
    if (!isValid) {
      console.warn(`Invalid payment details: reference=${paymentReference}, amount=${amount}`);
    }
    return isValid;
  } catch (error: any) {
    console.error('Payment gateway validation error:', error);
    return false;
  }
}

/**
 * Check if a medical representative is activated
 */
export async function isMedicalRepActivated(medicalRepresentativeId: string, tenantId?: string): Promise<boolean> {
  try {
    const medicalRep = await run(tenantId, () =>
      prisma.medicalRepresentative.findUnique({ where: { id: medicalRepresentativeId } })
    );
    return medicalRep?.isActivated || false;
  } catch (error) {
    console.error('Error checking medical rep activation status:', error);
    return false;
  }
}

/**
 * Get activation status and details for a medical representative
 */
export async function getActivationStatus(
  medicalRepresentativeId: string,
  tenantId?: string
): Promise<{
  isActivated: boolean;
  status: string;
  paymentStatus: string;
  activationDate?: Date;
  paymentDate?: Date;
}> {
  try {
    const medicalRep = await run(tenantId, () =>
      prisma.medicalRepresentative.findUnique({ where: { id: medicalRepresentativeId } })
    );

    if (!medicalRep) {
      return {
        isActivated: false,
        status: 'not_found',
        paymentStatus: 'pending',
      };
    }

    return {
      isActivated: medicalRep.isActivated,
      status: medicalRep.status,
      paymentStatus: medicalRep.paymentStatus,
      activationDate: medicalRep.activationDate ?? undefined,
      paymentDate: medicalRep.paymentDate ?? undefined,
    };
  } catch (error) {
    console.error('Error getting activation status:', error);
    return {
      isActivated: false,
      status: 'error',
      paymentStatus: 'pending',
    };
  }
}

/**
 * Refund a payment and deactivate the medical representative
 */
export async function refundPayment(
  medicalRepresentativeId: string,
  reason: string,
  tenantId?: string
): Promise<PaymentVerificationResponse> {
  try {
    const medicalRep = await run(tenantId, () =>
      prisma.medicalRepresentative.findUnique({ where: { id: medicalRepresentativeId } })
    );

    if (!medicalRep) {
      return {
        success: false,
        isValid: false,
        message: 'Medical representative not found',
      };
    }

    if (medicalRep.paymentStatus !== 'completed') {
      return {
        success: false,
        isValid: false,
        message: 'Only completed payments can be refunded',
      };
    }

    const oldPaymentStatus = medicalRep.paymentStatus;

    await run(tenantId, () =>
      prisma.medicalRepresentative.update({
        where: { id: medicalRep.id },
        data: {
          paymentStatus: 'refunded',
          isActivated: false,
          status: 'inactive',
        },
      })
    );

    await logAudit(tenantId, `Refunded payment for medical representative ${medicalRep.id}`, {
      entityType: 'MedicalRepresentative',
      entityId: medicalRep.id,
      changes: {
        paymentStatus: { from: oldPaymentStatus, to: 'refunded' },
        isActivated: { from: true, to: false },
      },
      refundReason: reason,
    });

    return {
      success: true,
      isValid: true,
      message: 'Payment refunded successfully',
      medicalRepresentativeId: medicalRep.id,
      activationStatus: 'inactive',
    };
  } catch (error: any) {
    console.error('Refund error:', error);
    return {
      success: false,
      isValid: false,
      message: 'An error occurred during refund processing',
      error: error.message,
    };
  }
}
