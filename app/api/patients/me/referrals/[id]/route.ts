import { NextRequest, NextResponse } from 'next/server';
import Referral from '@/models/Referral';
import logger from '@/lib/logger';
import { ownedRecordContext, isOwnedRecordError, recordNotFound } from '../../_lib/owned-record';
import { clinicNames } from '../../_lib/clinic-names';
import {
  PATIENT_REFERRAL_FILTER,
  PATIENT_REFERRAL_SELECT,
  patientReferralPopulates,
  toPatientReferral,
} from '../_lib/referral-view';

/**
 * GET /api/patients/me/referrals/[id]
 * One of the authenticated patient's referrals (same fields as the list). The letter PDF:
 * POST /api/patients/me/referrals/[id]/pdf-link.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await ownedRecordContext(request, id, 'Referral', 'records');
    if (isOwnedRecordError(ctx)) return ctx;

    let find = Referral.findOne({ ...ctx.filter, ...PATIENT_REFERRAL_FILTER }).select(PATIENT_REFERRAL_SELECT);
    for (const populate of patientReferralPopulates(ctx.linked.patientIds)) find = find.populate(populate);
    const referral = await find.lean<Record<string, any> | null>();
    if (!referral) return recordNotFound('Referral');

    return NextResponse.json({ success: true, data: toPatientReferral(referral, await clinicNames([referral.tenantId])) });
  } catch (error) {
    logger.error('Error fetching patient referral detail', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch referral' }, { status: 500 });
  }
}
