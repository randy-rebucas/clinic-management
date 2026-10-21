import { NextRequest, NextResponse } from 'next/server';
import Visit from '@/models/Visit';
import logger from '@/lib/logger';
import { ownedRecordContext, isOwnedRecordError, recordNotFound } from '../../_lib/owned-record';

/**
 * GET /api/patients/me/visits/[id]
 * Returns a single visit detail for the authenticated patient
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Own visit, at the patient's clinics (session clinic scope applies); malformed id → 404.
    const ctx = await ownedRecordContext(request, id, 'Visit', 'records');
    if (isOwnedRecordError(ctx)) return ctx;

    const visit = await Visit.findOne(ctx.filter)
      // `provider` refs User, which stores `name`.
      .populate({ path: 'provider', select: 'name' })
      .lean();

    if (!visit) return recordNotFound('Visit');

    return NextResponse.json({ success: true, data: visit });
  } catch (error: any) {
    logger.error('Error fetching patient visit detail', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch visit' },
      { status: 500 }
    );
  }
}
