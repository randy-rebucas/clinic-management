import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import RepAccessRequest from '@/models/RepAccessRequest';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { getClinicForReps } from '@/lib/rep-visits';
import { notifyClinicOfAccessRequest } from '@/lib/rep-access';
import { requireRepSession, isRepSessionError } from '../../../_lib/rep-session';
import { loadRepProfileForVisits, repDisplayName, visitError } from '../../../_lib/rep-visit-input';

/** After a decline, how long before the rep may ask the same clinic again. */
const ASK_AGAIN_AFTER_DAYS = 30;

const schema = z.object({
  /** To the clinic: who the rep is and why they'd like to visit. */
  message: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().trim().max(500).optional()),
});

/**
 * POST /api/medical-representatives/clinics/[id]/access  { message? }
 * Ask a clinic that takes rep visits (but hasn't added the rep and isn't open to all reps) to add
 * the rep to its representatives. The clinic's admins are told. Errors: 404 for a clinic not
 * taking rep visits; 409 ALREADY_LINKED, OPEN_CLINIC (book directly), ALREADY_REQUESTED, or
 * RECENTLY_DECLINED (declined in the last 30 days).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const { id } = await params;
    if (!isValidId(id)) return notFound('Clinic');
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;

    await connectDB();
    const [clinic, profile] = await Promise.all([getClinicForReps(id), loadRepProfileForVisits(rep)]);
    if (!clinic || !clinic.settings.enabled) return notFound('Clinic');
    if (!profile) return notFound('Representative');

    if ((profile.tenantIds ?? []).some((t) => String(t) === clinic.id)) {
      return visitError(409, 'This clinic already has you on its list.', 'ALREADY_LINKED');
    }
    if (clinic.settings.openToAllReps) {
      return visitError(409, 'This clinic takes visits from any rep. Book a slot directly.', 'OPEN_CLINIC');
    }

    const declinedSince = new Date(Date.now() - ASK_AGAIN_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const [pending, declined] = await Promise.all([
      RepAccessRequest.exists({ tenantId: clinic.id, medicalRepresentativeId: profile._id, status: 'pending' }),
      RepAccessRequest.exists({ tenantId: clinic.id, medicalRepresentativeId: profile._id, status: 'declined', respondedAt: { $gte: declinedSince } }),
    ]);
    if (pending) return visitError(409, 'Your request is already with this clinic.', 'ALREADY_REQUESTED');
    if (declined) return visitError(409, `This clinic declined recently. You can ask again ${ASK_AGAIN_AFTER_DAYS} days after.`, 'RECENTLY_DECLINED');

    let created;
    try {
      created = await RepAccessRequest.create({
        tenantId: clinic.id,
        medicalRepresentativeId: profile._id,
        userId: rep.userObjectId,
        repName: repDisplayName(profile),
        repCompany: profile.company,
        message: parsed.data.message,
      });
    } catch (error: any) {
      // Two taps at once: the unique pending index lets one through.
      if (error?.code === 11000) return visitError(409, 'Your request is already with this clinic.', 'ALREADY_REQUESTED');
      throw error;
    }

    await notifyClinicOfAccessRequest(clinic.id, created._id, { name: repDisplayName(profile), company: profile.company }, parsed.data.message);
    return NextResponse.json({ success: true, message: 'Request sent. The clinic will answer it.', data: { id: String(created._id), status: 'pending' } });
  } catch (error) {
    console.error('Rep access request error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/medical-representatives/clinics/[id]/access — withdraw a waiting request. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const { id } = await params;
    if (!isValidId(id)) return notFound('Clinic');

    await connectDB();
    const updated = await RepAccessRequest.findOneAndUpdate(
      { tenantId: id, userId: rep.userObjectId, status: 'pending' },
      { $set: { status: 'cancelled' } }
    ).lean();
    if (!updated) return notFound('Request');
    return NextResponse.json({ success: true, message: 'Request withdrawn' });
  } catch (error) {
    console.error('Withdraw rep access request error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
