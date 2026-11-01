import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { ACTIVE_CLINIC_STATUSES } from '@/lib/rep-visit-rules';
import { getClinicForReps } from '@/lib/rep-visits';
import { notifyClinicRepLeft } from '@/lib/rep-access';
import { requireRepSession, isRepSessionError } from '../../_lib/rep-session';
import { loadRepProfileForVisits, repDisplayName, visitError } from '../../_lib/rep-visit-input';

/**
 * DELETE /api/medical-representatives/clinics/[id]
 * The rep leaves a clinic's representatives (the clinic is told). The rep's account and other
 * clinics are untouched. A clinic open to all reps stays bookable after leaving. A clinic that
 * takes only reps it added can't be left while the rep has visits waiting or approved there
 * (409 ACTIVE_VISITS, with `count`): they'd be stuck, as the rep could no longer move them.
 * 404 when the rep isn't on the clinic's list.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const { id } = await params;
    if (!isValidId(id)) return notFound('Clinic');

    await connectDB();
    const profile = await loadRepProfileForVisits(rep);
    if (!profile || !(profile.tenantIds ?? []).some((t) => String(t) === id)) return notFound('Clinic');

    const clinic = await getClinicForReps(id);
    if (clinic && !clinic.settings.openToAllReps) {
      const count = await MedicalRepresentativeVisit.countDocuments({
        ...rep.ownerFilter,
        clinicId: new Types.ObjectId(id),
        status: { $in: ACTIVE_CLINIC_STATUSES },
        date: { $gte: new Date(new Date().toISOString().slice(0, 10)) },
      });
      if (count > 0) {
        return NextResponse.json(
          { success: false, error: 'Cancel your upcoming visits with this clinic first.', code: 'ACTIVE_VISITS', count },
          { status: 409 }
        );
      }
    }

    await MedicalRepresentative.updateOne({ _id: profile._id }, { $pull: { tenantIds: new Types.ObjectId(id) } });
    await notifyClinicRepLeft(id, { name: repDisplayName(profile), company: profile.company });

    return NextResponse.json({
      success: true,
      message: clinic?.settings.openToAllReps ? 'You left this clinic’s list. It still takes visits from any rep.' : 'You left this clinic.',
      data: { canBook: !!clinic?.settings.openToAllReps },
    });
  } catch (error) {
    console.error('Rep leave clinic error:', error);
    return visitError(500, 'Internal server error');
  }
}
