import { Types } from 'mongoose';
import Prescription from '@/models/Prescription';
import Visit from '@/models/Visit';
import { createAuditLog } from '@/lib/audit';
import { sendEmail, escapeHtml } from '@/lib/email';
import { nextPrescriptionCode } from '@/lib/clinical-codes';
import { getTenantTimezone, displayDate } from './shared';

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
    if (!tenantId) {
      throw new Error('Tenant is required');
    }

    // Fetch the visit with populated patient data
    const visit = await Visit.findOne({ _id: visitId, tenantId }).populate('patient', 'firstName lastName email phone');

    if (!visit) {
      throw new Error('Visit not found');
    }

    // Check if visit has medications in treatment plan
    if (!visit.treatmentPlan?.medications || visit.treatmentPlan.medications.length === 0) {
      return null;
    }

    // Check if prescription already exists for this visit
    const existingPrescription = await Prescription.findOne({ visit: visitId, tenantId });
    if (existingPrescription) {
      return existingPrescription;
    }

    // Shared 'prescription' counter (lib/clinical-codes) so manual and automatic codes never collide.
    const prescriptionCode = await nextPrescriptionCode(tenantId);

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
    // Patients have no User account, so only email is sent (no in-app notification).
    const patient = visit.patient as any;
    if (shouldSendNotification && patient) {
      if (patient.email) {
        const tz = await getTenantTimezone(tenantId);
        sendEmail({
          to: patient.email,
          subject: 'New Prescription Available',
          html: `<p>Dear ${escapeHtml(patient.firstName)} ${escapeHtml(patient.lastName)},</p>
                <p>Your prescription from your visit is now available.</p>
                <p><strong>Prescription Code:</strong> ${escapeHtml(prescriptionCode)}</p>
                <p><strong>Visit Code:</strong> ${escapeHtml(visit.visitCode)}</p>
                <p><strong>Visit Date:</strong> ${escapeHtml(displayDate(visit.date, tz))}</p>
                <p><strong>Medications:</strong></p>
                <ul>${medications.map((m: { name: string; instructions: string }) => `<li>${escapeHtml(m.name)} - ${escapeHtml(m.instructions)}</li>`).join('')}</ul>`,
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
    if (!tenantId) {
      throw new Error('Tenant is required');
    }

    const visit = await Visit.findOne({ _id: visitId, tenantId });

    if (!visit) {
      throw new Error('Visit not found');
    }

    const prescription = await Prescription.findOne({ visit: visitId, tenantId });

    if (!prescription) {
      // No existing prescription, create new one
      return await createPrescriptionFromVisit(params);
    }

    // A dispensed or closed prescription is a record of what was given; don't rewrite it.
    if (prescription.status !== 'active') {
      return prescription;
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
