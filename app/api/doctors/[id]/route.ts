import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import { requirePermission } from '@/app/lib/auth-helpers';
import { revokeUserSessions } from '@/app/lib/dal';
import {
  requireTenantSession,
  isTenantSessionError,
  tenantFilter,
  isValidId,
  notFound,
} from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { updateDoctorSchema, resolveSpecialization, validationMessage } from '../_lib/doctor-input';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'doctors', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Doctor');

    const doctor = await Doctor.findOne(tenantFilter(tenantId, { _id: id }))
      .populate('specializationId', 'name description category')
      .lean();
    if (!doctor) {
      return notFound('Doctor');
    }
    return NextResponse.json({ success: true, data: doctor });
  } catch (error) {
    console.error('Error fetching doctor:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch doctor' },
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

  const permissionCheck = await requirePermission(session, 'doctors', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Doctor');

    const parsed = await parseBody(request, updateDoctorSchema);
    if (isValidationError(parsed)) return parsed;

    const resolved = await resolveSpecialization(parsed.data);
    if ('error' in resolved) {
      return NextResponse.json({ success: false, error: resolved.error }, { status: 400 });
    }

    const doctor = await Doctor.findOneAndUpdate(
      tenantFilter(tenantId, { _id: id }),
      { $set: resolved },
      { new: true, runValidators: true }
    ).populate('specializationId', 'name description category');
    if (!doctor) {
      return notFound('Doctor');
    }

    // Keep the linked login in step with the doctor's status; a deactivated doctor is signed out.
    if (resolved.status === 'inactive' || resolved.status === 'active') {
      const user = await User.findOneAndUpdate(
        tenantFilter(tenantId, { doctorProfile: doctor._id }),
        { $set: { status: resolved.status } },
        { new: true }
      ).select('_id').lean<{ _id: unknown } | null>();
      if (user && resolved.status === 'inactive') {
        await revokeUserSessions(String(user._id));
      }
    }

    return NextResponse.json({ success: true, data: doctor });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: validationMessage(error) },
        { status: 400 }
      );
    }
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Doctor with this email or license number already exists' },
        { status: 409 }
      );
    }
    console.error('Error updating doctor:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update doctor' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'doctors', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Doctor');

    const doctor = await Doctor.findOneAndDelete(tenantFilter(tenantId, { _id: id }));
    if (!doctor) {
      return notFound('Doctor');
    }

    const user = await User.findOneAndDelete(tenantFilter(tenantId, { doctorProfile: doctor._id }))
      .select('_id')
      .lean<{ _id: unknown } | null>();
    if (user) {
      await revokeUserSessions(String(user._id));
    }

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    console.error('Error deleting doctor:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete doctor' },
      { status: 500 }
    );
  }
}
