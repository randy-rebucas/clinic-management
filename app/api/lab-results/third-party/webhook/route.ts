import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { handleLabResultWebhook } from '@/lib/lab-integration';
import { runAsSystem } from '@/lib/tenant-context';
import { findLabResultByExternalRequestId, updateLabResult } from '@/lib/data/lab-result';

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
    const rawBody = await request.text();

    if (process.env.LAB_WEBHOOK_SECRET) {
      const signature = request.headers.get('x-webhook-signature');
      if (!verifyWebhookSignature(rawBody, signature)) {
        return NextResponse.json({ success: false, error: 'Invalid webhook signature' }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ success: false, error: 'Lab webhook is not configured' }, { status: 503 });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const labConfig = {
      labName: body.labName || 'Unknown Lab',
      integrationType: 'api' as const,
    };

    const resultPayload = await handleLabResultWebhook(labConfig, body);

    if (!resultPayload) {
      return NextResponse.json({ success: false, error: 'Invalid webhook payload' }, { status: 400 });
    }

    // No tenant context is known to a third-party webhook — find the lab
    // result by its external request id across all tenants, same as any
    // other pre-session cross-tenant lookup (runAsSystem).
    const labResult = await runAsSystem(() => findLabResultByExternalRequestId(resultPayload.externalRequestId));

    if (!labResult) {
      return NextResponse.json({ success: false, error: 'Lab result not found' }, { status: 404 });
    }

    const updated = await runAsSystem(() =>
      updateLabResult(labResult.id, {
        results: resultPayload.results,
        resultDate: new Date(resultPayload.resultDate),
        referenceRanges: resultPayload.referenceRanges,
        abnormalFlags: resultPayload.abnormalFlags,
        interpretation: resultPayload.interpretation,
        status: 'completed',
        thirdPartyExternalResultId: resultPayload.externalResultId ?? undefined,
        thirdPartyStatus: labResult.thirdPartyLabName ? 'received' : undefined,
        thirdPartyReceivedAt: labResult.thirdPartyLabName ? new Date() : undefined,
      } as any)
    );

    return NextResponse.json({
      success: true,
      data: {
        requestCode: updated.requestCode,
        status: 'received',
      },
    });
  } catch (error: any) {
    console.error('Error processing lab result webhook:', error);
    return NextResponse.json({ success: false, error: 'Failed to process webhook' }, { status: 500 });
  }
}
