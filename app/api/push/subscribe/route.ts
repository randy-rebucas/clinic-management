import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import PushSubscription from '@/models/PushSubscription';
import { verifySession } from '@/app/lib/dal';
import { Types } from 'mongoose';
import { parseBody, isValidationError } from '@/lib/api/validate';

// web-push POSTs to the endpoint from our server, so only accept real push services.
const PUSH_HOST_EXACT = new Set([
  'fcm.googleapis.com',
  'web.push.apple.com',
  'updates.push.services.mozilla.com',
]);
const PUSH_HOST_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];

function isAllowedPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return PUSH_HOST_EXACT.has(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

const base64Url = /^[A-Za-z0-9_\-+/=]+$/;

const subscribeSchema = z.object({
  endpoint: z.string().max(2048).refine(isAllowedPushEndpoint, 'Unsupported push endpoint'),
  keys: z.object({
    p256dh: z.string().min(1).max(200).regex(base64Url),
    auth: z.string().min(1).max(100).regex(base64Url),
  }),
  userAgent: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session || !Types.ObjectId.isValid(session.userId)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const parsed = await parseBody(request, subscribeSchema);
    if (isValidationError(parsed)) {
      return NextResponse.json(
        { success: false, error: 'Invalid subscription payload' },
        { status: 400 }
      );
    }
    const { endpoint, keys, userAgent } = parsed.data;

    await connectDB();
    const tenantId = session.tenantId && Types.ObjectId.isValid(session.tenantId) ? session.tenantId : null;

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          endpoint,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
          userId: new Types.ObjectId(session.userId),
          ...(userAgent ? { userAgent } : {}),
          ...(tenantId ? { tenantId: new Types.ObjectId(tenantId) } : {}),
        },
        ...(tenantId ? {} : { $unset: { tenantId: 1 } }),
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Push] Subscribe error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save subscription' },
      { status: 500 }
    );
  }
}
