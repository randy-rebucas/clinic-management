import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import { getPermissionChecker, hasPermission, refuseAccess } from '@/app/lib/auth-helpers';
import { myDoctorProfileId } from '@/lib/doctor-access';
import { WEEKDAY_LONG, hoursProblems, toMin } from '@/lib/doctors';
import {
  requireTenantSession,
  isTenantSessionError,
  tenantFilter,
  isValidId,
  notFound,
} from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { scheduleEntrySchema, availabilityOverrideSchema, validationMessage } from '../../_lib/doctor-input';

const scheduleUpdateSchema = z.object({
  schedule: z.array(scheduleEntrySchema).max(50).optional(),
  availabilityOverrides: z.array(availabilityOverrideSchema).max(500).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  // Hours are read by the roster (doctors:read) and by booking (appointments:read).
  const can = await getPermissionChecker(session);
  if (!can('doctors', 'read') && !can('appointments', 'read')) {
    return refuseAccess(session, 'Unauthorized', 'doctors');
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Doctor');
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const doctor = await Doctor.findOne(tenantFilter(tenantId, { _id: id }))
      .select('schedule availabilityOverrides status')
      .lean() as any;

    if (!doctor) {
      return notFound('Doctor');
    }

    const scheduleData = {
      weeklySchedule: doctor.schedule || [],
      availabilityOverrides: doctor.availabilityOverrides || [],
    };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      scheduleData.availabilityOverrides = (doctor.availabilityOverrides || []).filter(
        (override: any) => {
          const overrideDate = new Date(override.date);
          return overrideDate >= start && overrideDate <= end;
        }
      );
    }

    return NextResponse.json({ success: true, data: scheduleData });
  } catch (error: any) {
    console.error('Error fetching doctor schedule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch doctor schedule' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Doctor');

    // Whoever manages doctors (doctors:update) may change anyone's hours; a doctor their own.
    if (!(await hasPermission(session, 'doctors', 'update'))) {
      const mine = await myDoctorProfileId(tenantId, session.userId);
      if (mine !== id) {
        return refuseAccess(session, 'Only the doctor themselves or someone who manages doctors can change these hours.', 'doctors', 'update');
      }
    }

    const parsed = await parseBody(request, scheduleUpdateSchema);
    if (isValidationError(parsed)) return parsed;

    if (parsed.data.schedule) {
      const days = parsed.data.schedule.map((s) => s.dayOfWeek);
      if (new Set(days).size !== days.length) {
        return NextResponse.json({ success: false, error: 'Each weekday can have one set of hours.' }, { status: 400 });
      }
      const problems = hoursProblems(parsed.data.schedule);
      const first = Object.keys(problems)[0];
      if (first !== undefined) {
        return NextResponse.json({ success: false, error: `${WEEKDAY_LONG[Number(first)]}: ${problems[Number(first)]}` }, { status: 400 });
      }
    }
    const badOverride = parsed.data.availabilityOverrides?.find(
      (o) => o.isAvailable && o.startTime && o.endTime && (toMin(o.endTime) ?? 0) <= (toMin(o.startTime) ?? 0)
    );
    if (badOverride) {
      return NextResponse.json({ success: false, error: 'Changed hours must end after they start.' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (parsed.data.schedule !== undefined) update.schedule = parsed.data.schedule;
    if (parsed.data.availabilityOverrides !== undefined) update.availabilityOverrides = parsed.data.availabilityOverrides;

    const doctor = await Doctor.findOneAndUpdate(
      tenantFilter(tenantId, { _id: id }),
      { $set: update },
      { new: true, runValidators: true }
    ).select('schedule availabilityOverrides status');

    if (!doctor) {
      return notFound('Doctor');
    }

    return NextResponse.json({ success: true, data: doctor });
  } catch (error: any) {
    console.error('Error updating doctor schedule:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: validationMessage(error) },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update doctor schedule' },
      { status: 500 }
    );
  }
}
