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
  /** Also send the other tests on the same order (same orderCode) that are still waiting. */
  wholeOrder: z.boolean().optional(),
});

type Sent = { labResultId: string; testType: string; success: boolean; skipped?: string; error?: string; externalRequestId?: string };

/**
 * POST /api/lab-results/third-party/send: send a lab order to a partner lab set up in LAB_INTEGRATIONS.
 * One test, or with wholeOrder every waiting test on its order. Each test is its own order at the lab
 * (its requestCode), so a resend after an error is safe: the lab answers with the order it already has.
 */
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
    const { labResultId, labConfig: requested, wholeOrder } = parsed.data;

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

    const first = await LabResult.findOne(tenantFilter(tenantId, { _id: labResultId })).select('orderCode').lean<{ _id: unknown; orderCode?: string } | null>();
    if (!first) return notFound('Lab result');
    const ids = wholeOrder && first.orderCode
      ? (await LabResult.find(tenantFilter(tenantId, { orderCode: first.orderCode })).select('_id').lean()).map((t) => t._id)
      : [first._id];

    const tests = await LabResult.find(tenantFilter(tenantId, { _id: { $in: ids } }))
      .populate({ path: 'patient', select: 'firstName lastName dateOfBirth sex patientCode', match: { tenantIds: tenantObjectId } })
      .populate({ path: 'visit', select: 'diagnoses chiefComplaint', match: { tenantId: tenantObjectId } });

    const sent: Sent[] = [];
    // One at a time: a small order, and the lab's rate limit is per clinic.
    for (const labResult of tests) {
      const base = { labResultId: String(labResult._id), testType: labResult.request?.testType ?? '' };
      const isThisOne = String(labResult._id) === String(first._id);
      if (labResult.status !== 'ordered' && labResult.status !== 'in-progress') {
        if (isThisOne) sent.push({ ...base, success: false, error: labResult.status === 'cancelled' ? 'This test is cancelled.' : 'This test already has a result.' });
        continue;
      }
      const prior = labResult.thirdPartyLab;
      if (prior && (prior.status === 'sent' || prior.status === 'received') && prior.integrationType === 'api') {
        sent.push({ ...base, success: true, skipped: prior.labCode === config.labCode ? 'already sent' : `already sent to ${prior.labName}` });
        continue;
      }
      const patient = labResult.patient as any;
      if (!patient) {
        sent.push({ ...base, success: false, error: 'The patient record isn’t available at this clinic.' });
        continue;
      }
      if (!labResult.requestCode) {
        sent.push({ ...base, success: false, error: 'This test has no request code to send.' });
        continue;
      }
      const visit = labResult.visit as any;

      const result = await sendLabRequestToThirdParty(config, {
        requestCode: labResult.requestCode,
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
        clinicalInfo: visit ? { diagnosis: visit.diagnoses?.[0]?.description, chiefComplaint: visit.chiefComplaint } : undefined,
        specialInstructions: labResult.request.specialInstructions,
      });

      // Credentials and endpoints are never stored on the lab result.
      const storedLab = { labName: config.labName, labId: config.labId, labCode: config.labCode, integrationType: config.integrationType };
      labResult.thirdPartyLab = result.success
        ? { ...storedLab, externalRequestId: result.externalRequestId, status: 'sent', sentAt: new Date() }
        : { ...storedLab, status: 'error', errorMessage: result.error };
      await labResult.save();
      sent.push({ ...base, success: result.success, error: result.error, externalRequestId: result.externalRequestId });
    }

    const ok = sent.filter((s) => s.success);
    const thisOne = sent.find((s) => s.labResultId === String(first._id));
    return NextResponse.json({
      // Kept for older callers: the outcome for the test named in the request.
      success: ok.length > 0 && sent.every((s) => s.success),
      data: {
        labName: config.labName,
        externalRequestId: thisOne?.externalRequestId,
        error: sent.find((s) => !s.success)?.error,
        tests: sent,
      },
    });
  } catch (error: any) {
    console.error('Error sending lab request to third party:', error);
    return NextResponse.json({ success: false, error: 'Failed to send request to third-party lab' }, { status: 500 });
  }
}
