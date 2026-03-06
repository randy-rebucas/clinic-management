import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { handleLabResultWebhook } from '@/lib/lab-integration';

/**
 * Verify HMAC-SHA256 webhook signature.
 * The lab provider must send: X-Webhook-Signature: sha256=<hex>
 * Set LAB_WEBHOOK_SECRET in environment to enable.
 */
function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.LAB_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const [algorithm, receivedHex] = signatureHeader.split('=');
  if (algorithm !== 'sha256' || !receivedHex) return false;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(receivedHex, 'hex'));
  } catch {
    return false;
  }
}

// Webhook endpoint for receiving lab results from third-party labs
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const rawBody = await request.text();

    // Enforce signature verification when LAB_WEBHOOK_SECRET is configured.
    // In production this variable MUST be set; all requests without a valid
    // signature are rejected.
    if (process.env.LAB_WEBHOOK_SECRET) {
      const signature = request.headers.get('x-webhook-signature');
      if (!verifyWebhookSignature(rawBody, signature)) {
        return NextResponse.json(
          { success: false, error: 'Invalid webhook signature' },
          { status: 401 }
        );
      }
    } else if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { success: false, error: 'Lab webhook is not configured' },
        { status: 503 }
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

