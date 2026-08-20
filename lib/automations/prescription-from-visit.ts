import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getVisitById } from '@/lib/data/visit';
import { createPrescription, replacePrescriptionMedications, getMaxPrescriptionCodeNumber, listPrescriptions, buildPrescriptionWhere } from '@/lib/data/prescription';
import { createAuditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';

function run<T>(tenantId: any, fn: () => T | Promise<T>): T | Promise<T> {
  const tid = tenantId ? String(tenantId) : null;
  return tid ? runWithTenant(tid, fn) : runAsSystem(fn);
}

interface CreatePrescriptionFromVisitParams {
  visitId: string;
  tenantId?: any;
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

function convertMedications(medications: MedicationFromTreatmentPlan[]) {
  return medications.map((med) => {
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
}

/**
 * Automatically create prescription from visit treatmentPlan.medications
 * Called when a visit is created or updated with medications
 */
export async function createPrescriptionFromVisit(params: CreatePrescriptionFromVisitParams) {
  const { visitId, tenantId, createdBy, shouldSendNotification = true } = params;

  try {
    return await run(tenantId, async () => {
      const visit = await getVisitById(visitId);

      if (!visit) {
        throw new Error('Visit not found');
      }

      const treatmentMedications = (visit as any).treatmentPlan?.medications;
      if (!treatmentMedications || treatmentMedications.length === 0) {
        return null;
      }

      // Check if prescription already exists for this visit
      const existing = await listPrescriptions(buildPrescriptionWhere({ visitId }));
      if (existing.length > 0) {
        return existing[0];
      }

      const nextNumber = (await getMaxPrescriptionCodeNumber()) + 1;
      const prescriptionCode = `RX-${String(nextNumber).padStart(6, '0')}`;

      const medications = convertMedications(treatmentMedications);

      const patient = (visit as any).patient;
      const digitalSignature = (visit as any).digitalSignature;

      const body: Record<string, any> = {
        prescriptionCode,
        issuedAt: new Date(),
        medications,
        status: 'active',
        printable: true,
        notes: `Generated automatically from visit ${(visit as any).visitCode}`,
      };

      if (digitalSignature) {
        body.digitalSignature = {
          providerName: digitalSignature.providerName,
          signatureData: digitalSignature.signatureData,
          signedAt: digitalSignature.signedAt,
        };
      }

      const prescription = await createPrescription(body, {
        patientId: patient?.id,
        visitId,
        prescribedById: (visit as any).providerId || createdBy || undefined,
      });

      await createAuditLog({
        userId: createdBy || 'system',
        userEmail: 'system',
        userRole: 'system',
        tenantId: tenantId ? String(tenantId) : undefined,
        action: 'create',
        resource: 'prescription',
        resourceId: (prescription as any).id,
        description: `Prescription ${prescriptionCode} created automatically from visit ${(visit as any).visitCode}`,
        metadata: {
          visitId,
          medicationCount: medications.length,
          automated: true,
        },
      });

      if (shouldSendNotification && patient) {
        createNotification({
          userId: patient.id,
          type: 'prescription',
          title: 'New Prescription Available',
          message: `Your prescription from ${(visit as any).visitType} visit is now available.`,
          metadata: {
            prescriptionId: (prescription as any).id,
            visitId,
          },
        }).catch((error: unknown) => {
          console.error('Error sending prescription notification:', error);
        });

        if (patient.email) {
          sendEmail({
            to: patient.email,
            subject: 'New Prescription Available',
            html: `<p>Dear ${patient.firstName} ${patient.lastName},</p>
                  <p>Your prescription from your visit is now available.</p>
                  <p><strong>Prescription Code:</strong> ${prescriptionCode}</p>
                  <p><strong>Visit Code:</strong> ${(visit as any).visitCode}</p>
                  <p><strong>Visit Date:</strong> ${new Date((visit as any).date).toLocaleDateString()}</p>
                  <p><strong>Medications:</strong></p>
                  <ul>${medications.map((m: { name: string; instructions: string }) => `<li>${m.name} - ${m.instructions}</li>`).join('')}</ul>`,
          }).catch((error: unknown) => {
            console.error('Error sending prescription email:', error);
          });
        }
      }

      return prescription;
    });
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
    return await run(tenantId, async () => {
      const visit = await getVisitById(visitId);

      if (!visit) {
        throw new Error('Visit not found');
      }

      const existing = await listPrescriptions(buildPrescriptionWhere({ visitId }));
      if (existing.length === 0) {
        return createPrescriptionFromVisit(params);
      }
      const existingPrescription = existing[0];

      const treatmentMedications = (visit as any).treatmentPlan?.medications;
      if (!treatmentMedications || treatmentMedications.length === 0) {
        return existingPrescription;
      }

      const medications = convertMedications(treatmentMedications);

      const prescription = await replacePrescriptionMedications((existingPrescription as any).id, medications);

      await createAuditLog({
        userId: createdBy || 'system',
        userEmail: 'system',
        userRole: 'system',
        tenantId: tenantId ? String(tenantId) : undefined,
        action: 'update',
        resource: 'prescription',
        resourceId: (prescription as any).id,
        description: `Prescription ${(prescription as any).prescriptionCode} updated from visit ${(visit as any).visitCode}`,
        metadata: {
          visitId,
          medicationCount: medications.length,
          automated: true,
        },
      });

      return prescription;
    });
  } catch (error) {
    console.error('Error updating prescription from visit:', error);
    throw error;
  }
}
