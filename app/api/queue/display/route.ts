import { NextRequest, NextResponse } from 'next/server';

/**
 * The old address of the waiting-room screen, now at /queue/display. It stays so TVs already
 * pointed here keep working. A relative Location keeps the clinic's subdomain.
 */
export function GET(request: NextRequest) {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: `/queue/display${request.nextUrl.search}`, 'Cache-Control': 'no-store' },
  });
}
