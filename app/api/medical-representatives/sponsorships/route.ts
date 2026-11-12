import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { getSponsorshipPrices, listRepSponsorships, requestSponsorship, sponsorableClinics } from '@/lib/clinic-sponsorship';
import { sponsorshipResponse } from '@/lib/api/sponsorship-response';
import { requireRepSession, isRepSessionError, repProfileFilter } from '../_lib/rep-session';

/**
 * GET /api/medical-representatives/sponsorships
 * The rep's clinic sponsorships (newest first), what each term costs, and the linked clinics
 * they could offer to sponsor (`clinics`).
 */
export async function GET() {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const [sponsorships, prices, clinics] = await Promise.all([
      listRepSponsorships(rep.session.userId),
      getSponsorshipPrices(),
      sponsorableClinics(rep.session.userId),
    ]);
    return NextResponse.json({ success: true, data: { sponsorships, prices, clinics } });
  } catch (error) {
    console.error('List rep sponsorships error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

const offerSchema = z.object({
  clinicId: zObjectId,
  message: z.string().trim().max(500).optional(),
});

/**
 * POST /api/medical-representatives/sponsorships  { clinicId, message? }
 * Offer to pay for a linked clinic's subscription. The clinic accepts or declines; the rep pays
 * once it is accepted (POST ./[id]/checkout).
 */
export async function POST(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const parsed = await parseBody(request, offerSchema);
    if (isValidationError(parsed)) return parsed;

    await connectDB();
    const profile = await MedicalRepresentative.findOne(repProfileFilter(rep)).select('_id').lean<{ _id: unknown } | null>();
    if (!profile) return NextResponse.json({ success: false, error: 'Medical representative not found' }, { status: 404 });

    const r = await requestSponsorship({
      tenantId: parsed.data.clinicId,
      repId: String(profile._id),
      by: 'rep',
      userId: rep.session.userId,
      message: parsed.data.message,
    });
    return sponsorshipResponse(r, 201);
  } catch (error) {
    console.error('Offer sponsorship error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
