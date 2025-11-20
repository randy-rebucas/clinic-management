import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { searchICD10 } from '@/lib/icd10';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';

    if (!query || query.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const results = searchICD10(query);
    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    console.error('Error searching ICD-10:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to search ICD-10 codes' },
      { status: 500 }
    );
  }
}

