import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, patientTenantFilter, tenantFilter } from '@/lib/api/tenant-session';
import { checkDrugInteractions, checkInteractionsWithPatientMedications } from '@/lib/drug-interactions';

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { tenantId } = ctx;

  const permissionCheck = await requirePermission(ctx.session, 'prescriptions', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const body = await request.json().catch(() => null);
    const { medications, patientId, includePatientMedications } = body ?? {};

    if (!medications || !Array.isArray(medications) || medications.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Medications array is required' },
        { status: 400 }
      );
    }

    let interactions;
    if (includePatientMedications && patientId) {
      const patient = isValidId(patientId)
        ? await Patient.exists(patientTenantFilter(tenantId, { _id: patientId }))
        : null;
      if (!patient) {
        return NextResponse.json(
          { success: false, error: 'Patient not found' },
          { status: 404 }
        );
      }

      const activePrescriptions = await Prescription.find(tenantFilter(tenantId, {
        patient: patient._id,
        status: { $in: ['active', 'partially-dispensed'] },
      }));

      const currentMedications = activePrescriptions.flatMap((prescription) =>
        prescription.medications.map((med: any) => ({
          name: med.name,
          genericName: med.genericName,
        }))
      );

      interactions = checkInteractionsWithPatientMedications(medications, currentMedications);
    } else {
      interactions = checkDrugInteractions(medications);
    }

    return NextResponse.json({
      success: true,
      data: {
        interactions,
        hasInteractions: interactions.length > 0,
        severityCounts: {
          contraindicated: interactions.filter((i) => i.severity === 'contraindicated').length,
          severe: interactions.filter((i) => i.severity === 'severe').length,
          moderate: interactions.filter((i) => i.severity === 'moderate').length,
          mild: interactions.filter((i) => i.severity === 'mild').length,
        },
      },
    });
  } catch (error: any) {
    console.error('Error checking drug interactions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check drug interactions' },
      { status: 500 }
    );
  }
}
