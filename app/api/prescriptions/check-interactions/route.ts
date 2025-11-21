import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { checkDrugInteractions, checkInteractionsWithPatientMedications } from '@/lib/drug-interactions';

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const body = await request.json();
    const { medications, patientId, includePatientMedications } = body;

    if (!medications || !Array.isArray(medications)) {
      return NextResponse.json(
        { success: false, error: 'Medications array is required' },
        { status: 400 }
      );
    }

    let interactions;
    if (includePatientMedications && patientId) {
      // Get patient's current active prescriptions
      const patient = await Patient.findById(patientId);
      if (!patient) {
        return NextResponse.json(
          { success: false, error: 'Patient not found' },
          { status: 404 }
        );
      }

      // Get active prescriptions for this patient
      const activePrescriptions = await Prescription.find({
        patient: patientId,
        status: { $in: ['active', 'partially-dispensed'] },
      });

      const currentMedications = activePrescriptions.flatMap((prescription) =>
        prescription.medications.map((med: any) => ({
          name: med.name,
          genericName: med.genericName,
        }))
      );

      interactions = await checkInteractionsWithPatientMedications(medications, currentMedications);
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

