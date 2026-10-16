import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import { isAdmin } from '@/app/lib/auth-helpers';
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
  const { tenantId } = ctx;

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

  if (!isAdmin(session) && session.role !== 'doctor') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Doctor');

    // Doctors may only edit their own schedule.
    if (!isAdmin(session)) {
      const user = await User.findOne(tenantFilter(tenantId, { _id: session.userId }))
        .select('doctorProfile')
        .lean() as any;
      if (!user?.doctorProfile || String(user.doctorProfile) !== id) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 403 }
        );
      }
    }

    const parsed = await parseBody(request, scheduleUpdateSchema);
    if (isValidationError(parsed)) return parsed;

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
