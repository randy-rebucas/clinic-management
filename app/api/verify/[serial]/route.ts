import { NextRequest, NextResponse } from 'next/server';
import { verifySeal } from '@/lib/document-seal';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';

/**
 * Public document verification API (no auth) — for pharmacies, insurers and
 * HMOs that want to check a printed serial programmatically.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serial: string }> }
) {
  const limited = await applyRateLimit(request, rateLimiters.public);
  if (limited) {
    return limited;
  }

  try {
    const { serial } = await params;
    const verification = await verifySeal(serial);

    return NextResponse.json(
      { success: true, data: verification },
      { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }
    );
  } catch (error) {
    console.error('Error verifying document seal:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify document' },
      { status: 500 }
    );
  }
}
