import { NextRequest, NextResponse } from 'next/server';
import Prescription from '@/models/Prescription';
import logger from '@/lib/logger';
import { ownedRecordContext, isOwnedRecordError, recordNotFound } from '../../_lib/owned-record';

/**
 * GET /api/patients/me/prescriptions/[id]
 * One of the authenticated patient's prescriptions.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await ownedRecordContext(request, id, 'Prescription');
    if (isOwnedRecordError(ctx)) return ctx;

    const prescription = await Prescription.findOne(ctx.filter)
      .populate({ path: 'prescribedBy', select: 'firstName lastName email' })
      .lean();
    if (!prescription) return recordNotFound('Prescription');

    return NextResponse.json({ success: true, data: prescription });
  } catch (error) {
    logger.error('Error fetching patient prescription detail', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch prescription' }, { status: 500 });
  }
}
