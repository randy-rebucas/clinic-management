import { NextRequest, NextResponse } from 'next/server';
import Prescription from '@/models/Prescription';
import { PRESCRIBER_POPULATE, prescriptionVisitPopulate } from '../../_lib/prescription-visit';
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

    const tenantFilter = ctx.filter.tenantId !== undefined ? { tenantId: ctx.filter.tenantId } : {};
    const prescription = await Prescription.findOne(ctx.filter)
      .populate(PRESCRIBER_POPULATE)
      .populate(prescriptionVisitPopulate(ctx.linked.patientIds, tenantFilter))
      .lean();
    if (!prescription) return recordNotFound('Prescription');

    return NextResponse.json({ success: true, data: prescription });
  } catch (error) {
    logger.error('Error fetching patient prescription detail', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch prescription' }, { status: 500 });
  }
}
