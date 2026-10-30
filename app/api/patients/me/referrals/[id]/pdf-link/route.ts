import { NextRequest, NextResponse } from 'next/server';
import Referral from '@/models/Referral';
import logger from '@/lib/logger';
import { ownedRecordContext, isOwnedRecordError, recordNotFound } from '../../../_lib/owned-record';
import { referralLetterUnavailable } from '@/lib/referral-letter';
import { createReferralLetterLinkToken } from '@/lib/referral-letter-link';
import { requestOrigin } from '@/lib/signed-link';
import { PATIENT_REFERRAL_FILTER } from '../../_lib/referral-view';

/**
 * POST /api/patients/me/referrals/[id]/pdf-link
 * A 10-minute link to the referral letter PDF (GET /api/referral-letter/:token), for the app to
 * download and open. 409 `NO_LETTER` when the referral has no letter (one the clinic received
 * rather than sent, or cancelled/declined).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await ownedRecordContext(request, id, 'Referral', 'records');
    if (isOwnedRecordError(ctx)) return ctx;

    const referral = await Referral.findOne({ ...ctx.filter, ...PATIENT_REFERRAL_FILTER })
      .select('_id type status referringDoctor referringClinic referringContact.name receivingClinic')
      .lean<Record<string, any> | null>();
    if (!referral) return recordNotFound('Referral');
    const unavailable = referralLetterUnavailable(referral);
    if (unavailable) {
      return NextResponse.json(
        { success: false, code: 'NO_LETTER', error: 'There is no referral letter for this referral.' },
        { status: 409 }
      );
    }

    const { token, expiresAt } = createReferralLetterLinkToken(String(referral._id));
    return NextResponse.json({
      success: true,
      data: { url: `${requestOrigin(request)}/api/referral-letter/${token}`, expiresAt: expiresAt.toISOString() },
    });
  } catch (error) {
    logger.error('Error creating referral letter PDF link', error as Error);
    return NextResponse.json({ success: false, error: 'Could not prepare the PDF. Try again.' }, { status: 500 });
  }
}
