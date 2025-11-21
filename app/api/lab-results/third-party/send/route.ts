import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { sendLabRequestToThirdParty } from '@/lib/lab-integration';

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const body = await request.json();
    const { labResultId, labConfig } = body;

    if (!labResultId || !labConfig) {
      return NextResponse.json(
        { success: false, error: 'Lab result ID and lab configuration required' },
        { status: 400 }
      );
    }

    const labResult = await LabResult.findById(labResultId)
      .populate('patient', 'firstName lastName dateOfBirth sex patientCode')
      .populate('visit', 'diagnoses chiefComplaint');

    if (!labResult) {
      return NextResponse.json(
        { success: false, error: 'Lab result not found' },
        { status: 404 }
      );
    }

    const patient = labResult.patient as any;
    const visit = labResult.visit as any;

    // Prepare request payload
    const requestPayload = {
      requestCode: labResult.requestCode || '',
      patient: {
        firstName: patient.firstName,
        lastName: patient.lastName,
        dateOfBirth: patient.dateOfBirth ? new Date(patient.dateOfBirth).toISOString().split('T')[0] : '',
        gender: patient.sex,
        patientCode: patient.patientCode,
      },
      testType: labResult.request.testType,
      testCode: labResult.request.testCode,
      urgency: labResult.request.urgency || 'routine',
      clinicalInfo: visit ? {
        diagnosis: visit.diagnoses?.[0]?.description,
        chiefComplaint: visit.chiefComplaint,
      } : undefined,
      specialInstructions: labResult.request.specialInstructions,
    };

    // Send to third-party lab
    const result = await sendLabRequestToThirdParty(labConfig, requestPayload);

    if (result.success) {
      // Update lab result with third-party lab info
      labResult.thirdPartyLab = {
        ...labConfig,
        externalRequestId: result.externalRequestId,
        status: 'sent',
        sentAt: new Date(),
      };
      await labResult.save();
    } else {
      // Update with error status
      labResult.thirdPartyLab = {
        ...labConfig,
        status: 'error',
        errorMessage: result.error,
      };
      await labResult.save();
    }

    return NextResponse.json({
      success: result.success,
      data: {
        externalRequestId: result.externalRequestId,
        error: result.error,
      },
    });
  } catch (error: any) {
    console.error('Error sending lab request to third party:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send request to third-party lab' },
      { status: 500 }
    );
  }
}

