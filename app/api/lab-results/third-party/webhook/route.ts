import { NextRequest, NextResponse, after } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { handleLabResultWebhook, labWebhookSecret, verifyWebhookSignature } from '@/lib/lab-integration';

// Webhook endpoint for receiving lab results from third-party labs
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // A lab with its own secret is held to the requests sent to it; the shared secret can't say
    // which lab is calling.
    const labCode = request.headers.get('x-lab-code')?.trim() || null;
    const ownSecret = labCode ? labWebhookSecret(labCode) : null;
    const secret = ownSecret ?? process.env.LAB_WEBHOOK_SECRET;

    // The webhook writes clinical results, so a valid signature is always required.
    if (!secret) {
      return NextResponse.json(
        { success: false, error: 'Lab webhook is not configured' },
        { status: 503 }
      );
    }
    const signatureOk = verifyWebhookSignature(rawBody, {
      signature: request.headers.get('x-webhook-signature'),
      timestamp: request.headers.get('x-webhook-timestamp'),
    }, secret);
    if (!signatureOk) {
      return NextResponse.json(
        { success: false, error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    // Extract lab configuration from webhook (or use lab identifier)
    const labConfig = {
      labName: body.labName || 'Unknown Lab',
      integrationType: 'api' as const,
    };

    // Process webhook payload
    const resultPayload = await handleLabResultWebhook(labConfig, body);

    if (!resultPayload) {
      return NextResponse.json(
        { success: false, error: 'Invalid webhook payload' },
        { status: 400 }
      );
    }

    if (typeof resultPayload.externalRequestId !== 'string' || !resultPayload.externalRequestId) {
      return NextResponse.json({ success: false, error: 'Invalid webhook payload' }, { status: 400 });
    }

    await connectDB();

    // Only requests this system actually sent; when the lab echoes our request code,
    // it must match too. An id shared by several clinics' requests is rejected.
    const filter: Record<string, unknown> = {
      'thirdPartyLab.externalRequestId': resultPayload.externalRequestId,
      'thirdPartyLab.status': { $in: ['sent', 'received'] },
    };
    if (ownSecret) filter['thirdPartyLab.labCode'] = labCode;
    if (typeof body.requestCode === 'string' && body.requestCode) {
      filter.requestCode = body.requestCode;
    }
    const matches = await LabResult.find(filter).limit(2);
    if (matches.length > 1) {
      return NextResponse.json(
        { success: false, error: 'Ambiguous request id; include requestCode' },
        { status: 409 }
      );
    }
    const labResult = matches[0];

    if (!labResult) {
      return NextResponse.json(
        { success: false, error: 'Lab result not found' },
        { status: 404 }
      );
    }

    // A result already applied (a retry or a replay) changes nothing; a correction comes with a
    // new result id.
    const resultId = resultPayload.externalResultId ? String(resultPayload.externalResultId) : null;
    if (resultId && labResult.thirdPartyLab?.externalResultId === resultId) {
      return NextResponse.json({ success: true, data: { requestCode: labResult.requestCode, status: 'received', duplicate: true } });
    }

    // Update lab result with received data
    labResult.results = resultPayload.results;
    labResult.resultDate = new Date(resultPayload.resultDate);
    labResult.referenceRanges = resultPayload.referenceRanges;
    labResult.abnormalFlags = resultPayload.abnormalFlags;
    labResult.interpretation = resultPayload.interpretation;
    labResult.status = 'completed';
    // Results from outside go to the ordering clinician before the patient hears; a correction to a
    // reviewed result needs a fresh review.
    labResult.awaitingReview = true;
    labResult.reviewedBy = undefined;
    labResult.reviewedAt = undefined;

    if (labResult.thirdPartyLab) {
      labResult.thirdPartyLab.externalResultId = resultId ?? undefined;
      labResult.thirdPartyLab.status = 'received';
      labResult.thirdPartyLab.receivedAt = new Date();
    }

    await labResult.save();

    if (labResult.tenantId) {
      const held = { _id: labResult._id, orderedBy: labResult.orderedBy, request: labResult.request };
      const tenantId = labResult.tenantId;
      after(async () => {
        try {
          const { notifyDoctorToReview } = await import('@/lib/automations/lab-notifications');
          await notifyDoctorToReview(held, tenantId);
        } catch (error) {
          console.error('Error asking for lab result review:', error);
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        requestCode: labResult.requestCode,
        status: 'received',
      },
    });
  } catch (error: any) {
    console.error('Error processing lab result webhook:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
}
