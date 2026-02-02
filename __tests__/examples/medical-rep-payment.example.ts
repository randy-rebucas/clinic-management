/**
 * Example/Test file for Medical Representative Payment Verification
 * 
 * This file demonstrates how to use the payment verification system
 * and can be used for manual testing
 */

import { verifyPayment, isMedicalRepActivated, getActivationStatus, refundPayment } from '@/lib/medical-rep-payment';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import connectDB from '@/lib/mongodb';

/**
 * Example 1: Verify Payment for a Medical Representative
 */
export async function exampleVerifyPayment() {
  try {
    // Verify payment
    const result = await verifyPayment({
      paymentReference: 'TXN-2024-001234',
      paymentMethod: 'credit_card',
      paymentAmount: 5000,
      email: 'john.doe@example.com',
    });

    console.log('Payment verification result:', result);
    // Expected output: { success: true, isValid: true, message: "...", medicalRepresentativeId: "..." }
  } catch (error) {
    console.error('Error verifying payment:', error);
  }
}

/**
 * Example 2: Check if Medical Rep is Activated
 */
export async function exampleCheckActivation() {
  try {
    await connectDB();

    // Find a medical rep
    const medicalRep = await MedicalRepresentative.findOne({});

    if (!medicalRep) {
      console.log('No medical representatives found');
      return;
    }

    // Check if activated
    const isActivated = await isMedicalRepActivated(medicalRep._id);
    console.log(`Medical Rep ${medicalRep.firstName} is activated:`, isActivated);
  } catch (error) {
    console.error('Error checking activation:', error);
  }
}

/**
 * Example 3: Get Detailed Activation Status
 */
export async function exampleGetActivationStatus() {
  try {
    await connectDB();

    // Find a medical rep
    const medicalRep = await MedicalRepresentative.findOne({});

    if (!medicalRep) {
      console.log('No medical representatives found');
      return;
    }

    // Get status
    const status = await getActivationStatus(medicalRep._id);
    console.log(`Medical Rep ${medicalRep.firstName} status:`, status);
    // Expected: { isActivated: boolean, status: string, paymentStatus: string, activationDate?: Date, paymentDate?: Date }
  } catch (error) {
    console.error('Error getting activation status:', error);
  }
}

/**
 * Example 4: Refund Payment
 */
export async function exampleRefundPayment() {
  try {
    await connectDB();

    // Find a medical rep with completed payment
    const medicalRep = await MedicalRepresentative.findOne({
      paymentStatus: 'completed',
    });

    if (!medicalRep) {
      console.log('No activated medical representatives found');
      return;
    }

    // Refund the payment
    const result = await refundPayment(medicalRep._id, 'Customer requested refund');
    console.log('Refund result:', result);
  } catch (error) {
    console.error('Error refunding payment:', error);
  }
}

/**
 * Example 5: Check Payment Status Distribution
 */
export async function exampleCheckPaymentStats() {
  try {
    await connectDB();

    const stats = await MedicalRepresentative.aggregate([
      {
        $group: {
          _id: '$paymentStatus',
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    console.log('Payment status distribution:');
    stats.forEach((stat) => {
      console.log(`  ${stat._id}: ${stat.count}`);
    });

    // Activation distribution
    const activation = await MedicalRepresentative.aggregate([
      {
        $group: {
          _id: '$isActivated',
          count: { $sum: 1 },
        },
      },
    ]);

    console.log('\nActivation distribution:');
    activation.forEach((stat) => {
      console.log(`  Activated: ${stat._id ? 'Yes' : 'No'} - ${stat.count}`);
    });
  } catch (error) {
    console.error('Error checking statistics:', error);
  }
}

/**
 * Example 6: Get All Pending Activations
 */
export async function exampleGetPendingActivations() {
  try {
    await connectDB();

    const pending = await MedicalRepresentative.find({
      paymentStatus: 'pending',
    }).select('firstName lastName email company paymentAmount createdAt');

    console.log(`Found ${pending.length} pending activations:`);
    pending.forEach((rep) => {
      console.log(
        `- ${rep.firstName} ${rep.lastName} (${rep.email}) - ${rep.company} - PHP ${rep.paymentAmount}`
      );
    });
  } catch (error) {
    console.error('Error getting pending activations:', error);
  }
}

/**
 * Example 7: Manual Payment Processing (Admin Function)
 */
export async function exampleManualPaymentProcessing(
  medicalRepId: string,
  paymentReference: string,
  paymentMethod: string,
  paymentAmount: number
) {
  try {
    await connectDB();

    const medicalRep = await MedicalRepresentative.findById(medicalRepId);

    if (!medicalRep) {
      console.log('Medical representative not found');
      return;
    }

    // Manually process payment (after admin verification)
    medicalRep.isActivated = true;
    medicalRep.paymentStatus = 'completed';
    medicalRep.paymentDate = new Date();
    medicalRep.activationDate = new Date();
    medicalRep.paymentReference = paymentReference;
    medicalRep.paymentMethod = paymentMethod;
    medicalRep.paymentAmount = paymentAmount;
    medicalRep.status = 'active';

    await medicalRep.save();

    console.log(`✅ Manual payment processed for ${medicalRep.firstName} ${medicalRep.lastName}`);
    console.log(`   Payment Reference: ${paymentReference}`);
    console.log(`   Amount: PHP ${paymentAmount}`);
    console.log(`   Method: ${paymentMethod}`);
  } catch (error) {
    console.error('Error processing manual payment:', error);
  }
}

// Export all examples for use
export const examples = {
  verifyPayment: exampleVerifyPayment,
  checkActivation: exampleCheckActivation,
  getActivationStatus: exampleGetActivationStatus,
  refundPayment: exampleRefundPayment,
  checkPaymentStats: exampleCheckPaymentStats,
  getPendingActivations: exampleGetPendingActivations,
  manualPaymentProcessing: exampleManualPaymentProcessing,
};
