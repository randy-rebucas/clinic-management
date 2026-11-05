import { NextRequest, NextResponse } from 'next/server';
import { validateRequest } from 'twilio/lib/webhooks/webhooks';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import SmsMessage from '@/models/SmsMessage';
import { signedTwilioUrl } from '@/lib/twilio-webhook';

const FAILED_STATUSES = new Set(['failed', 'undelivered']);

/**
 * POST /api/webhooks/twilio/status?id=<SmsMessage id>
 *
 * Twilio's delivery callback, set per message by sendSMS. Only failures are written: storing every
 * status would triple the writes for each text.
 */
export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return new NextResponse('Service Unavailable', { status: 503 });

  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(await request.text())) params[key] = value;

  const signature = request.headers.get('x-twilio-signature') ?? '';
  if (!signature || !validateRequest(authToken, signature, signedTwilioUrl(request), params)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const status = params.MessageStatus ?? '';
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (FAILED_STATUSES.has(status) && Types.ObjectId.isValid(id)) {
    await connectDB();
    await SmsMessage.updateOne({ _id: id }, { $set: { status, errorCode: params.ErrorCode || undefined } });
  }
  return new NextResponse(null, { status: 204 });
}
