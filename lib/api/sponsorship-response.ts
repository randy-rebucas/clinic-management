import 'server-only';
import { NextResponse } from 'next/server';
import type { Result } from '@/lib/clinic-sponsorship';

/** A lib/clinic-sponsorship.ts result as the API's { success, data } / { success, error, code } JSON. */
export function sponsorshipResponse<T>(r: Result<T>, okStatus = 200): NextResponse {
  if (r.ok) return NextResponse.json({ success: true, data: r.data }, { status: okStatus });
  return NextResponse.json({ success: false, error: r.error, ...(r.code ? { code: r.code } : {}) }, { status: r.status });
}
