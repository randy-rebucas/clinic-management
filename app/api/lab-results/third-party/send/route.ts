import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { requirePermission } from '@/app/lib/auth-helpers';
import { sendLabRequestToThirdParty, getConfiguredLab, LabIntegrationConfig } from '@/lib/lab-integration';
import { requireTenantSession, isTenantSessionError, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';

const sendSchema = z.object({
  labResultId: zObjectId,
  labConfig: z.object({
    labName: z.string().trim().min(1).max(200),
    labId: z.string().max(100).optional(),
    labCode: z.string().max(100).optional(),
    integrationType: z.enum(['manual', 'api', 'hl7', 'other']).optional(),
  }),
});

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'lab-results', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const parsed = await parseBody(request, sendSchema);
    if (isValidationError(parsed)) return parsed;
    const { labResultId, labConfig: requested } = parsed.data;

    const labResult = await LabResult.findOne(tenantFilter(tenantId, { _id: labResultId }))
      .populate({ path: 'patient', select: 'firstName lastName dateOfBirth sex patientCode', match: { tenantIds: tenantObjectId } })
      .populate({ path: 'visit', select: 'diagnoses chiefComplaint', match: { tenantId: tenantObjectId } });

    if (!labResult) return notFound('Lab result');

    const patient = labResult.patient as any;
    if (!patient) return notFound('Patient');
    const visit = labResult.visit as any;

    // Only labs set up on the server (LAB_INTEGRATIONS) for this clinic. An endpoint from the
    // request would let staff send patient details anywhere, and let the reply claim another
    // clinic's request id.
    const config: LabIntegrationConfig | null = getConfiguredLab(requested.labCode, tenantId);
    if (!config) {
      return NextResponse.json(
        { success: false, error: 'This lab is not connected for your clinic. Ask MyClinicSoft support to set it up.' },
        { status: 400 }
      );
    }

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

    const result = await sendLabRequestToThirdParty(config, requestPayload);

    // Credentials and endpoints are never stored on the lab result.
    const storedLab = {
      labName: config.labName,
      labId: config.labId,
      labCode: config.labCode,
      integrationType: config.integrationType,
    };
    labResult.thirdPartyLab = result.success
      ? { ...storedLab, externalRequestId: result.externalRequestId, status: 'sent', sentAt: new Date() }
      : { ...storedLab, status: 'error', errorMessage: result.error };
    await labResult.save();

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
