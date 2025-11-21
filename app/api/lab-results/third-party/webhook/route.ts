import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { handleLabResultWebhook } from '@/lib/lab-integration';

// Webhook endpoint for receiving lab results from third-party labs
// This should be publicly accessible (no authentication required)
// In production, add webhook signature verification
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();

    // Verify webhook signature (implement based on lab's security requirements)
    // const signature = request.headers.get('x-webhook-signature');
    // if (!verifyWebhookSignature(signature, body)) {
    //   return NextResponse.json(
    //     { success: false, error: 'Invalid webhook signature' },
    //     { status: 401 }
    //   );
    // }

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

    // Find lab result by external request ID
    const labResult = await LabResult.findOne({
      'thirdPartyLab.externalRequestId': resultPayload.externalRequestId,
    });

    if (!labResult) {
      return NextResponse.json(
        { success: false, error: 'Lab result not found' },
        { status: 404 }
      );
    }

    // Update lab result with received data
    labResult.results = resultPayload.results;
    labResult.resultDate = new Date(resultPayload.resultDate);
    labResult.referenceRanges = resultPayload.referenceRanges;
    labResult.abnormalFlags = resultPayload.abnormalFlags;
    labResult.interpretation = resultPayload.interpretation;
    labResult.status = 'completed';

    if (labResult.thirdPartyLab) {
      labResult.thirdPartyLab.externalResultId = resultPayload.externalResultId;
      labResult.thirdPartyLab.status = 'received';
      labResult.thirdPartyLab.receivedAt = new Date();
    }

    await labResult.save();

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

