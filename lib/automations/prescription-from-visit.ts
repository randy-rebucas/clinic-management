import { Types } from 'mongoose';
import Prescription from '@/models/Prescription';
import Visit from '@/models/Visit';
import { createAuditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';

interface CreatePrescriptionFromVisitParams {
  visitId: Types.ObjectId | string;
  tenantId?: Types.ObjectId;
  createdBy?: string;
  shouldSendNotification?: boolean;
}

interface MedicationFromTreatmentPlan {
  name: string;
  dosage: string;
  frequency: string;
  quantity?: number;
  duration?: string;
  instructions?: string;
}

/**
 * Automatically create prescription from visit treatmentPlan.medications
 * Called when a visit is created or updated with medications
 */
export async function createPrescriptionFromVisit(params: CreatePrescriptionFromVisitParams) {
  const { visitId, tenantId, createdBy, shouldSendNotification = true } = params;

  try {
    // Fetch the visit with populated patient data
    const visit = await Visit.findById(visitId).populate('patient', 'firstName lastName email phone');
    
    if (!visit) {
      throw new Error('Visit not found');
    }

    // Check if visit has medications in treatment plan
    if (!visit.treatmentPlan?.medications || visit.treatmentPlan.medications.length === 0) {
      return null;
    }

    // Check if prescription already exists for this visit
    const existingPrescription = await Prescription.findOne({ visit: visitId });
    if (existingPrescription) {
      return existingPrescription;
    }

    // Auto-generate prescription code (tenant-scoped)
    const codeQuery: any = { prescriptionCode: { $exists: true, $ne: null } };
    if (tenantId) {
      codeQuery.tenantId = tenantId;
    } else {
      codeQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const lastPrescription = await Prescription.findOne(codeQuery)
      .sort({ prescriptionCode: -1 })
      .exec();
    
    let nextNumber = 1;
    if (lastPrescription?.prescriptionCode) {
      const match = lastPrescription.prescriptionCode.match(/(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }
    
    const prescriptionCode = `RX-${String(nextNumber).padStart(6, '0')}`;

    // Convert visit medications to prescription medications format
    const medications = visit.treatmentPlan.medications.map((med: MedicationFromTreatmentPlan) => {
      // Parse duration string (e.g., "7 days", "2 weeks") to days
      let durationDays: number | undefined;
      if (med.duration) {
        const durationMatch = med.duration.match(/(\d+)\s*(day|week|month)/i);
        if (durationMatch) {
          const value = parseInt(durationMatch[1], 10);
          const unit = durationMatch[2].toLowerCase();
          if (unit === 'day') {
            durationDays = value;
          } else if (unit === 'week') {
            durationDays = value * 7;
          } else if (unit === 'month') {
            durationDays = value * 30;
          }
        }
      }

      return {
        name: med.name,
        dose: med.dosage,
        frequency: med.frequency,
        quantity: med.quantity,
        durationDays,
        instructions: med.instructions || [med.dosage, med.frequency, med.duration].filter(Boolean).join(' ') || 'As directed',
      };
    });

    // Create prescription data
    const prescriptionData: any = {
      prescriptionCode,
      visit: visitId,
      patient: visit.patient._id,
      prescribedBy: visit.provider || createdBy,
      issuedAt: new Date(),
      medications,
      status: 'active',
      printable: true,
      notes: `Generated automatically from visit ${visit.visitCode}`,
    };

    // Add tenant if provided
    if (tenantId) {
      prescriptionData.tenantId = tenantId;
    }

    // Copy digital signature from visit if available
    if (visit.digitalSignature) {
      prescriptionData.digitalSignature = {
        providerName: visit.digitalSignature.providerName,
        signatureData: visit.digitalSignature.signatureData,
        signedAt: visit.digitalSignature.signedAt,
      };
    }

    // Create the prescription
    const prescription = await Prescription.create(prescriptionData);

    // Log creation
    await createAuditLog({
      userId: createdBy || 'system',
      userEmail: 'system',
      userRole: 'system',
      tenantId: tenantId,
      action: 'create',
      resource: 'prescription',
      resourceId: prescription._id,
      description: `Prescription ${prescriptionCode} created automatically from visit ${visit.visitCode}`,
      metadata: {
        visitId: visitId.toString(),
        medicationCount: medications.length,
        automated: true,
      },
    });

    // Send notifications if enabled
    if (shouldSendNotification && visit.patient) {
      // Queue notification (fire and forget)
      createNotification({
        userId: visit.patient._id.toString(),
        type: 'prescription',
        title: 'New Prescription Available',
        message: `Your prescription from ${visit.visitType} visit is now available.`,
        metadata: {
          prescriptionId: prescription._id.toString(),
          visitId: visitId.toString(),
        },
      }).catch((error: unknown) => {
        console.error('Error sending prescription notification:', error);
      });

      // Send email notification (fire and forget)
      if (visit.patient.email) {
        sendEmail({
          to: visit.patient.email,
          subject: 'New Prescription Available',
          html: `<p>Dear ${visit.patient.firstName} ${visit.patient.lastName},</p>
                <p>Your prescription from your visit is now available.</p>
                <p><strong>Prescription Code:</strong> ${prescriptionCode}</p>
                <p><strong>Visit Code:</strong> ${visit.visitCode}</p>
                <p><strong>Visit Date:</strong> ${visit.date.toLocaleDateString()}</p>
                <p><strong>Medications:</strong></p>
                <ul>${medications.map((m: { name: string; instructions: string }) => `<li>${m.name} - ${m.instructions}</li>`).join('')}</ul>`,
        }).catch((error: unknown) => {
          console.error('Error sending prescription email:', error);
        });
      }
    }

    return prescription;
  } catch (error) {
    console.error('Error creating prescription from visit:', error);
    throw error;
  }
}

/**
 * Update existing prescription when visit medications are updated
 */
export async function updatePrescriptionFromVisit(params: CreatePrescriptionFromVisitParams) {
  const { visitId, tenantId, createdBy } = params;

  try {
    // Fetch the visit
    const visit = await Visit.findById(visitId);
    
    if (!visit) {
      throw new Error('Visit not found');
    }

    // Find existing prescription
    const prescription = await Prescription.findOne({ visit: visitId });
    
    if (!prescription) {
      // No existing prescription, create new one
      return await createPrescriptionFromVisit(params);
    }

    // Check if visit has medications
    if (!visit.treatmentPlan?.medications || visit.treatmentPlan.medications.length === 0) {
      return prescription;
    }

    // Convert visit medications to prescription format
    const medications = visit.treatmentPlan.medications.map((med: MedicationFromTreatmentPlan) => {
      let durationDays: number | undefined;
      if (med.duration) {
        const durationMatch = med.duration.match(/(\d+)\s*(day|week|month)/i);
        if (durationMatch) {
          const value = parseInt(durationMatch[1], 10);
          const unit = durationMatch[2].toLowerCase();
          if (unit === 'day') {
            durationDays = value;
          } else if (unit === 'week') {
            durationDays = value * 7;
          } else if (unit === 'month') {
            durationDays = value * 30;
          }
        }
      }

      return {
        name: med.name,
        dose: med.dosage,
        frequency: med.frequency,
        quantity: med.quantity,
        durationDays,
        instructions: med.instructions || [med.dosage, med.frequency, med.duration].filter(Boolean).join(' ') || 'As directed',
      };
    });

    // Update prescription
    prescription.medications = medications;
    prescription.updatedAt = new Date();
    await prescription.save();

    // Log update
    await createAuditLog({
      userId: createdBy || 'system',
      userEmail: 'system',
      userRole: 'system',
      tenantId: tenantId,
      action: 'update',
      resource: 'prescription',
      resourceId: prescription._id,
      description: `Prescription ${prescription.prescriptionCode} updated from visit ${visit.visitCode}`,
      metadata: {
        visitId: visitId.toString(),
        medicationCount: medications.length,
        automated: true,
      },
    });

    return prescription;
  } catch (error) {
    console.error('Error updating prescription from visit:', error);
    throw error;
  }
}
