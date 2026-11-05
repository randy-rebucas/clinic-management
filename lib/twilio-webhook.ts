import type { NextRequest } from 'next/server';

/**
 * The URL Twilio signed: the public URL configured in the console. Behind a proxy
 * request.url is the internal address, so prefer the configured app URL.
 */
export function signedTwilioUrl(request: NextRequest): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/+$/, '');
  if (base) {
    const { pathname, search } = new URL(request.url);
    return `${base}${pathname}${search}`;
  }
  return request.url;
}
