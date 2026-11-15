import { NextRequest, NextResponse } from 'next/server';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';

const MAX = { message: 500, stack: 4000, screen: 200, version: 20, platform: 20 } as const;

function text(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

/**
 * POST /api/medical-representatives/client-errors (public): a JavaScript crash from eMedRoute, so
 * release crashes aren't invisible. Written to the server log (searchable in the host's logs), not
 * stored. The app sends only the error, the screen path and the app version; no account data.
 * Body: { message, stack?, screen?, appVersion?, platform?, fatal? }
 */
export async function POST(request: NextRequest) {
  const limited = await applyRateLimit(request, rateLimiters.clientErrorReport);
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 });
  }
  const message = text(body.message, MAX.message);
  if (!message) return NextResponse.json({ success: false, error: 'message is required' }, { status: 400 });

  console.error(
    '[eMedRoute crash]',
    JSON.stringify({
      message,
      fatal: body.fatal === true,
      screen: text(body.screen, MAX.screen),
      appVersion: text(body.appVersion, MAX.version),
      platform: text(body.platform, MAX.platform),
      stack: text(body.stack, MAX.stack),
    })
  );
  return NextResponse.json({ success: true });
}
