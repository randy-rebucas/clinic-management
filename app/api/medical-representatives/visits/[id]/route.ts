import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { requireRepSession, isRepSessionError } from '../../_lib/rep-session';

const updateVisitSchema = z.object({
  clinicName: z.string().trim().min(1).max(200),
  clinicLocation: z.string().trim().min(1).max(300),
  purpose: z.string().trim().min(1).max(500),
  date: z.coerce.date(),
  time: z.string().trim().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:mm format.'),
  duration: z.coerce.number().int().positive().max(24 * 60).optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
  notes: z.preprocess((v) => (v === null ? undefined : v), z.string().trim().max(2000).optional()),
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
 * Update a visit
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

    const parsed = await parseBody(request, updateVisitSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    await connectDB();

    // A moved visit gets a fresh day-before reminder.
    const current = await MedicalRepresentativeVisit.findOne({ ...rep.ownerFilter, _id: visitId })
      .select('date time')
      .lean<{ date?: Date; time?: string } | null>();
    if (!current) return notFound('Visit');
    const rescheduled =
      current.date?.getTime() !== body.date.getTime() || current.time !== body.time;

    const updatedVisit = await MedicalRepresentativeVisit.findOneAndUpdate(
      { ...rep.ownerFilter, _id: visitId },
      {
        ...(rescheduled ? { $unset: { reminderSentAt: 1 } } : {}),
        $set: {
          clinicName: body.clinicName,
          clinicLocation: body.clinicLocation,
          purpose: body.purpose,
          date: body.date,
          time: body.time,
          duration: body.duration || 60,
          status: body.status || 'scheduled',
          notes: body.notes || '',
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

/**
 * DELETE /api/medical-representatives/visits/[id]
 * Delete a visit
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
    }).lean();

    if (!deletedVisit) return notFound('Visit');

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
