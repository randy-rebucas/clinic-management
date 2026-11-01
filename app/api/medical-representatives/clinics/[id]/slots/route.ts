import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { getClinicForReps, repMayBook, bookedSlotCounts } from '@/lib/rep-visits';
import { slotsForDay, parseVisitDay, localNow } from '@/lib/rep-visit-rules';
import { requireRepSession, isRepSessionError, repProfileFilter } from '../../../_lib/rep-session';

/**
 * GET /api/medical-representatives/clinics/[id]/slots?date=YYYY-MM-DD
 * The clinic's rep visiting slots that day, with how many reps each can still take.
 * Times are the clinic's local time.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    const { id } = await params;
    if (!isValidId(id)) return notFound('Clinic');
    const day = request.nextUrl.searchParams.get('date') ?? '';
    const date = parseVisitDay(day);
    if (!date) {
      return NextResponse.json({ success: false, error: 'date must be YYYY-MM-DD.' }, { status: 400 });
    }

    await connectDB();
    const [clinic, profile] = await Promise.all([
      getClinicForReps(id),
      MedicalRepresentative.findOne(repProfileFilter(rep)).select('tenantIds').lean<{ tenantIds?: unknown[] } | null>(),
    ]);
    if (!clinic || !repMayBook(clinic, profile?.tenantIds).allowed) return notFound('Clinic');

    const slots = slotsForDay(clinic.settings, day, await bookedSlotCounts(clinic.id, date), localNow(clinic.timezone));
    return NextResponse.json({
      success: true,
      data: { clinicId: clinic.id, date: day, timezone: clinic.timezone, slotMinutes: clinic.settings.slotMinutes, slots },
    });
  } catch (error) {
    console.error('Get rep clinic slots error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
