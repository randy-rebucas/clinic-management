import { NextRequest, NextResponse } from 'next/server';
import LabResult from '@/models/LabResult';
import logger from '@/lib/logger';
import { ownedRecordContext, isOwnedRecordError, recordNotFound } from '../../_lib/owned-record';
import { PATIENT_LAB_RESULT_HIDDEN } from '../../_lib/lab-result-fields';

/**
 * GET /api/patients/me/lab-results/[id]
 * One of the authenticated patient's lab results.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await ownedRecordContext(request, id, 'Lab result');
    if (isOwnedRecordError(ctx)) return ctx;

    const labResult = await LabResult.findOne(ctx.filter).select(PATIENT_LAB_RESULT_HIDDEN).lean();
    if (!labResult) return recordNotFound('Lab result');

    return NextResponse.json({ success: true, data: labResult });
  } catch (error) {
    logger.error('Error fetching patient lab result detail', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch lab result' }, { status: 500 });
  }
}
