import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { searchICD10 } from '@/lib/icd10';

/**
 * GET /api/icd10?q=diabetes&limit=10
 * Searches ICD-10-CM codes via the free NLM ClinicalTables API.
 * Requires staff authentication.
 */
export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(
    20,
    Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') ?? '10', 10))
  );

  if (!q || q.length < 2) {
    return NextResponse.json({ success: true, data: [] });
  }

  const results = await searchICD10(q, limit);
  return NextResponse.json({ success: true, data: results });
}
