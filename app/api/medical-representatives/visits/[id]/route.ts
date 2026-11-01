import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { getClinicForReps, slotRemaining, notifyClinicOfVisit } from '@/lib/rep-visits';
import { ACTIVE_CLINIC_STATUSES, parseVisitDay, type RepVisitStatus } from '@/lib/rep-visit-rules';
import { requireRepSession, isRepSessionError, type RepSession } from '../../_lib/rep-session';
import { loadRepProfileForVisits, resolveLinkedClinic, resolveVisitProducts, repDisplayName, visitError } from '../../_lib/rep-visit-input';

const updateVisitSchema = z.object({
  clinicName: z.string().trim().min(1).max(200),
  clinicLocation: z.string().trim().min(1).max(300),
  purpose: z.string().trim().min(1).max(500),
  date: z.coerce.date(),
  time: z.string().trim().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format.'),
  duration: z.coerce.number().int().positive().max(24 * 60).optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
  notes: z.preprocess((v) => (v === null ? undefined : v), z.string().trim().max(2000).optional()),
  productIds: z.unknown().optional(),
  /** A clinic in the rep's directory, or null to unlink; left out keeps the link as it is. */
  linkedClinicId: z.union([z.string(), z.null()]).optional(),
});

/**
 * A visit booked with a clinic. The clinic's name, location and length come from the clinic and
 * are ignored here; the rep may only cancel (status), move it (date + time, which asks the clinic
 * again), or change the purpose, products and private notes.
 */
const updateClinicVisitSchema = z.object({
  purpose: z.string().trim().min(1).max(500).optional(),
  date: z.string().trim().optional(),
  time: z.string().trim().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format.').optional(),
  status: z.string().trim().optional(),
  notes: z.preprocess((v) => (v === null ? undefined : v), z.string().trim().max(2000).optional()),
  productIds: z.unknown().optional(),
});

/**
 * GET /api/medical-representatives/visits/[id]
 * One of the rep's visits.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    const { id: visitId } = await params;
    if (!isValidId(visitId)) return notFound('Visit');

    await connectDB();

    const visit = await MedicalRepresentativeVisit.findOne({ ...rep.ownerFilter, _id: visitId }).lean();
    if (!visit) return notFound('Visit');

    return NextResponse.json({ success: true, data: visit });
  } catch (error: any) {
    console.error('Get visit error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/medical-representatives/visits/[id]
 * Update a visit. For a visit booked with a clinic see updateClinicVisitSchema.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    const { id: visitId } = await params;
    if (!isValidId(visitId)) return notFound('Visit');

    await connectDB();

    const current = await MedicalRepresentativeVisit.findOne({ ...rep.ownerFilter, _id: visitId })
      .select('clinicId date time status')
      .lean<{ clinicId?: unknown; date?: Date; time?: string; status: RepVisitStatus } | null>();
    if (!current) return notFound('Visit');

    if (current.clinicId) return updateClinicVisit(request, rep, visitId, current);

    const parsed = await parseBody(request, updateVisitSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    const productIds = await resolveVisitProducts(rep, body.productIds);
    if (productIds instanceof NextResponse) return productIds;
    const linkedClinic = await resolveLinkedClinic(rep, body.linkedClinicId);
    if (linkedClinic instanceof NextResponse) return linkedClinic;

    // A moved visit gets a fresh day-before reminder.
    const rescheduled =
      current.date?.getTime() !== body.date.getTime() || current.time !== body.time;

    const updatedVisit = await MedicalRepresentativeVisit.findOneAndUpdate(
      { ...rep.ownerFilter, _id: visitId },
      {
        ...(rescheduled || linkedClinic === null
          ? { $unset: { ...(rescheduled ? { reminderSentAt: 1 } : {}), ...(linkedClinic === null ? { linkedClinicId: 1 } : {}) } }
          : {}),
        $set: {
          clinicName: linkedClinic ? linkedClinic.name : body.clinicName,
          clinicLocation: linkedClinic ? linkedClinic.location : body.clinicLocation,
          ...(linkedClinic ? { linkedClinicId: linkedClinic.id } : {}),
          purpose: body.purpose,
          date: body.date,
          time: body.time,
          duration: body.duration || 60,
          status: body.status || 'scheduled',
          notes: body.notes || '',
          ...(productIds ? { productIds } : {}),
        },
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedVisit) return notFound('Visit');

    return NextResponse.json({
      success: true,
      message: 'Visit updated successfully',
      data: updatedVisit,
    });
  } catch (error: any) {
    console.error('Update visit error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function updateClinicVisit(
  request: NextRequest,
  rep: RepSession,
  visitId: string,
  current: { clinicId?: unknown; date?: Date; time?: string; status: RepVisitStatus }
) {
  const parsed = await parseBody(request, updateClinicVisitSchema);
  if (isValidationError(parsed)) return parsed;
  const body = parsed.data;
  const active = ACTIVE_CLINIC_STATUSES.includes(current.status);

  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  if (body.notes !== undefined) set.notes = body.notes;

  // Anything beyond private notes needs the visit still open with the clinic.
  const cancelling = body.status === 'cancelled' && current.status !== 'cancelled';
  if (body.status && body.status !== current.status && !cancelling) {
    return visitError(400, 'The clinic sets this visit’s status. You can only cancel it.', 'STATUS_SET_BY_CLINIC');
  }
  if (!active && (cancelling || body.purpose || body.productIds !== undefined || body.date || body.time)) {
    return visitError(409, 'This visit is closed. Only your notes can change.', 'VISIT_CLOSED');
  }

  if (body.purpose) set.purpose = body.purpose;
  const productIds = await resolveVisitProducts(rep, body.productIds);
  if (productIds instanceof NextResponse) return productIds;
  if (productIds) set.productIds = productIds;

  // The app may send back the stored ISO date; its first 10 characters are the day.
  const day = (body.date ?? current.date?.toISOString() ?? '').slice(0, 10);
  const time = body.time ?? current.time ?? '';
  const newDate = parseVisitDay(day);
  if (!newDate) return visitError(400, 'date must be YYYY-MM-DD for a clinic visit.');
  const moved = !cancelling && (newDate.getTime() !== current.date?.getTime() || time !== current.time);

  if (moved) {
    const clinic = await getClinicForReps(String(current.clinicId));
    if (!clinic) return visitError(409, 'This clinic no longer takes rep visits.', 'SLOT_UNAVAILABLE');
    const remaining = await slotRemaining(clinic, day, newDate, time, visitId);
    if (remaining === null) return visitError(400, 'The clinic does not take rep visits at that time.', 'SLOT_UNAVAILABLE');
    if (remaining <= 0) return visitError(409, 'That slot is full. Pick another time.', 'SLOT_FULL');
    // The clinic answers again for the new time.
    Object.assign(set, { date: newDate, time, status: 'requested' });
    Object.assign(unset, { reminderSentAt: 1, respondedAt: 1, respondedBy: 1, clinicNote: 1 });
  }
  if (cancelling) Object.assign(set, { status: 'cancelled', cancelledBy: 'rep' });

  const updatedVisit = await MedicalRepresentativeVisit.findOneAndUpdate(
    // The status guard stops a race with the clinic answering at the same moment.
    { ...rep.ownerFilter, _id: visitId, status: current.status },
    { ...(Object.keys(unset).length ? { $unset: unset } : {}), $set: set },
    { new: true, runValidators: true }
  ).lean<any>();
  if (!updatedVisit) return visitError(409, 'The clinic just updated this visit. Reload and try again.', 'VISIT_CHANGED');

  if (moved || cancelling) {
    const profile = await loadRepProfileForVisits(rep);
    if (profile) {
      await notifyClinicOfVisit(updatedVisit, cancelling ? 'cancelled' : 'rescheduled', { name: repDisplayName(profile), company: profile.company });
    }
  }

  return NextResponse.json({
    success: true,
    message: moved ? 'Visit moved. The clinic will confirm the new time.' : cancelling ? 'Visit cancelled' : 'Visit updated successfully',
    data: updatedVisit,
  });
}

/**
 * DELETE /api/medical-representatives/visits/[id]
 * Delete a visit. A visit still open with a clinic has to be cancelled first, so the clinic hears of it.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    const { id: visitId } = await params;
    if (!isValidId(visitId)) return notFound('Visit');

    await connectDB();

    const deletedVisit = await MedicalRepresentativeVisit.findOneAndDelete({
      ...rep.ownerFilter,
      _id: visitId,
      $nor: [{ clinicId: { $exists: true }, status: { $in: ACTIVE_CLINIC_STATUSES } }],
    }).lean();

    if (!deletedVisit) {
      const open = await MedicalRepresentativeVisit.exists({ ...rep.ownerFilter, _id: visitId });
      if (open) return visitError(409, 'Cancel this visit first so the clinic knows.', 'VISIT_ACTIVE');
      return notFound('Visit');
    }

    return NextResponse.json({
      success: true,
      message: 'Visit deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete visit error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
