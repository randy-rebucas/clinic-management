import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { sendLabRequestToThirdParty } from '@/lib/lab-integration';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getLabResultById, updateLabResult } from '@/lib/data/lab-result';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { labResultId, labConfig } = body;

    if (!labResultId || !labConfig) {
      return NextResponse.json(
        { success: false, error: 'Lab result ID and lab configuration required' },
        { status: 400 }
      );
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const labResult = await run(tenantId, () => getLabResultById(labResultId));

    if (!labResult) {
      return NextResponse.json({ success: false, error: 'Lab result not found' }, { status: 404 });
    }

    const patient = labResult.patient as any;
    const visit = labResult.visit as any;

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
      testCode: labResult.request.testCode ?? undefined,
      urgency: labResult.request.urgency || 'routine',
      clinicalInfo: visit
        ? {
            diagnosis: visit.diagnoses?.[0]?.description ?? undefined,
            chiefComplaint: visit.chiefComplaint ?? undefined,
          }
        : undefined,
      specialInstructions: labResult.request.specialInstructions ?? undefined,
    };

    const result = await sendLabRequestToThirdParty(labConfig, requestPayload);

    await run(tenantId, () =>
      updateLabResult(labResultId, {
        thirdPartyLabName: labConfig.labName ?? undefined,
        thirdPartyLabId: labConfig.labId ?? undefined,
        thirdPartyLabCode: labConfig.labCode ?? undefined,
        thirdPartyIntegrationType: labConfig.integrationType ?? undefined,
        thirdPartyApiEndpoint: labConfig.apiEndpoint ?? undefined,
        thirdPartyApiKey: labConfig.apiKey ?? undefined,
        ...(result.success
          ? {
              thirdPartyExternalRequestId: result.externalRequestId ?? undefined,
              thirdPartyStatus: 'sent',
              thirdPartySentAt: new Date(),
            }
          : {
              thirdPartyStatus: 'error',
              thirdPartyErrorMessage: result.error ?? undefined,
            }),
      } as any)
    );

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
