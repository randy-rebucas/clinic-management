import { NextRequest, NextResponse } from 'next/server';
import Prescription from '@/models/Prescription';
import logger from '@/lib/logger';
import { ownedRecordContext, isOwnedRecordError, recordNotFound } from '../../../_lib/owned-record';
import { createPrescriptionLinkToken } from '@/lib/prescription-link';
import { requestOrigin } from '@/lib/signed-link';

/**
 * POST /api/patients/me/prescriptions/[id]/pdf-link
 * A 10-minute link to the patient's sealed prescription PDF, for the app to open in the browser.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await ownedRecordContext(request, id, 'Prescription');
    if (isOwnedRecordError(ctx)) return ctx;

    const prescription = await Prescription.findOne(ctx.filter).select('_id status').lean<{ _id: unknown; status?: string } | null>();
    if (!prescription) return recordNotFound('Prescription');
    if (prescription.status === 'cancelled') {
      return NextResponse.json({ success: false, error: 'This prescription was cancelled.' }, { status: 409 });
    }

    const { token, expiresAt } = createPrescriptionLinkToken(String(prescription._id));
    return NextResponse.json({
      success: true,
      data: { url: `${requestOrigin(request)}/api/rx/${token}`, expiresAt: expiresAt.toISOString() },
    });
  } catch (error) {
    logger.error('Error creating prescription PDF link', error as Error);
    return NextResponse.json({ success: false, error: 'Could not prepare the PDF. Try again.' }, { status: 500 });
  }
}
