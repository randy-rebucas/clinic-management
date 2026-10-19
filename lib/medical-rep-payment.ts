/**
 * Medical Representative Payment Verification Utility
 * Handles payment processing and verification for medical representative activation
 */

import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import AuditLog from '@/models/AuditLog';
import { Types } from 'mongoose';
import { isPayMongoConfigured, paidTotal, retrieveCheckoutSession } from '@/lib/paymongo';

export interface PaymentVerificationRequest {
  paymentReference: string;
  paymentMethod: string;
  paymentAmount: number;
  medicalRepresentativeId?: string | Types.ObjectId;
  email?: string;
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
    await connectDB();

    const { paymentReference, paymentMethod, paymentAmount, medicalRepresentativeId, email } = request;

    // Validate payment details
    if (!paymentReference || !paymentMethod || !paymentAmount) {
      return {
        success: false,
        isValid: false,
        message: 'Invalid payment details provided',
        error: 'Missing required payment information',
      };
    }

    // Find the medical representative
    let medicalRep;
    if (medicalRepresentativeId) {
      medicalRep = await MedicalRepresentative.findById(medicalRepresentativeId);
    } else if (email) {
      medicalRep = await MedicalRepresentative.findOne({ email: email.toLowerCase().trim() });
    }

    if (!medicalRep) {
      return {
        success: false,
        isValid: false,
        message: 'Medical representative not found',
        error: 'Unable to locate medical representative record',
      };
    }

    const isPaymentValid = await validatePaymentWithGateway(paymentReference, paymentMethod, paymentAmount, medicalRep._id.toString());

    if (!isPaymentValid) {
      // Update payment status to failed
      medicalRep.paymentStatus = 'failed';
      await medicalRep.save();

      // Log the failed payment attempt
      await AuditLog.create({
        action: 'UPDATE',
        entityType: 'MedicalRepresentative',
        entityId: medicalRep._id,
        changes: {
          paymentStatus: {
            from: 'pending',
            to: 'failed',
          },
        },
        metadata: {
          reason: 'Payment verification failed',
          paymentReference,
        },
      });

      return {
        success: false,
        isValid: false,
        message: 'Payment verification failed',
        medicalRepresentativeId: medicalRep._id.toString(),
        error: 'Payment could not be verified. Please try again.',
      };
    }

    // Payment is valid - activate the medical representative
    medicalRep.isActivated = true;
    medicalRep.paymentStatus = 'completed';
    medicalRep.paymentDate = new Date();
    medicalRep.activationDate = new Date();
    medicalRep.paymentReference = paymentReference;
    medicalRep.paymentMethod = paymentMethod;
    medicalRep.paymentAmount = paymentAmount;
    medicalRep.status = 'active';

    const previousStatus = 'inactive';
    await medicalRep.save();

    // Log the successful payment and activation
    await AuditLog.create({
      action: 'UPDATE',
      entityType: 'MedicalRepresentative',
      entityId: medicalRep._id,
      changes: {
        isActivated: {
          from: false,
          to: true,
        },
        paymentStatus: {
          from: 'pending',
          to: 'completed',
        },
        status: {
          from: previousStatus,
          to: 'active',
        },
      },
      metadata: {
        paymentReference,
        paymentMethod,
        paymentAmount,
      },
    });

    return {
      success: true,
      isValid: true,
      message: 'Payment verified successfully. Medical representative account activated.',
      medicalRepresentativeId: medicalRep._id.toString(),
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
 * Check a payment with PayMongo: the reference must be a checkout session that PayMongo says is
 * paid, made for this rep's activation, for at least the amount claimed. Anything else (a typed
 * receipt number, another gateway) is not proof of payment and is refused; an admin activates
 * those by hand after checking.
 */
async function validatePaymentWithGateway(
  paymentReference: string,
  _paymentMethod: string,
  amount: number,
  repId: string
): Promise<boolean> {
  if (!isPayMongoConfigured() || !/^cs_[A-Za-z0-9]+$/.test(paymentReference)) return false;
  try {
    const session = await retrieveCheckoutSession(paymentReference);
    return session.metadata.purpose === 'medrep' && session.metadata.repId === repId && paidTotal(session) + 0.005 >= amount && amount > 0;
  } catch (error: any) {
    console.error('Payment gateway validation error:', error);
    return false;
  }
}

/**
 * Check if a medical representative is activated
 */
export async function isMedicalRepActivated(medicalRepresentativeId: string | Types.ObjectId): Promise<boolean> {
  try {
    await connectDB();
    const medicalRep = await MedicalRepresentative.findById(medicalRepresentativeId);
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
  medicalRepresentativeId: string | Types.ObjectId
): Promise<{
  isActivated: boolean;
  status: string;
  paymentStatus: string;
  activationDate?: Date;
  paymentDate?: Date;
}> {
  try {
    await connectDB();
    const medicalRep = await MedicalRepresentative.findById(medicalRepresentativeId);

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
      activationDate: medicalRep.activationDate,
      paymentDate: medicalRep.paymentDate,
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
export async function refundPayment(medicalRepresentativeId: string | Types.ObjectId, reason: string): Promise<PaymentVerificationResponse> {
  try {
    await connectDB();

    const medicalRep = await MedicalRepresentative.findById(medicalRepresentativeId);

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

    // TODO: Call payment gateway to refund
    // For now, just update the status

    const oldPaymentStatus = medicalRep.paymentStatus;
    medicalRep.paymentStatus = 'refunded';
    medicalRep.isActivated = false;
    medicalRep.status = 'inactive';

    await medicalRep.save();

    // Log the refund
    await AuditLog.create({
      action: 'UPDATE',
      entityType: 'MedicalRepresentative',
      entityId: medicalRep._id,
      changes: {
        paymentStatus: {
          from: oldPaymentStatus,
          to: 'refunded',
        },
        isActivated: {
          from: true,
          to: false,
        },
      },
      metadata: {
        refundReason: reason,
      },
    });

    return {
      success: true,
      isValid: true,
      message: 'Payment refunded successfully',
      medicalRepresentativeId: medicalRep._id.toString(),
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
