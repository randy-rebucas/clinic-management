import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import Prescription from '@/models/Prescription';
import '@/models/Role';
import { hasPermission, requirePermission } from '@/app/lib/auth-helpers';
import { revokeUserSessions } from '@/app/lib/dal';
import {
  requireTenantSession,
  isTenantSessionError,
  tenantFilter,
  isValidId,
  notFound,
} from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { updateDoctorSchema, duplicateResponse, resolveSpecialization, validationMessage } from '../_lib/doctor-input';
import { changedSentence, doctorChanges, doctorLabel, logDoctorChange } from '../_lib/doctor-audit';

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

    // Internal notes are for the people who manage doctors (doctors:update); everyone else who
    // may read the roster, medical representatives included, gets the profile without them.
    const canSeeNotes = await hasPermission(session, 'doctors', 'update');
    const query = Doctor.findOne(tenantFilter(tenantId, { _id: id }))
      .select(canSeeNotes ? '-performanceMetrics -professionalFees' : '-internalNotes -performanceMetrics -professionalFees')
      .populate('specializationId', 'name description category');
    if (canSeeNotes) query.populate('internalNotes.createdBy', 'name');
    const doctor = await query.lean();
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

    const before = await Doctor.findOne(tenantFilter(tenantId, { _id: id })).lean<Record<string, any> | null>();
    if (!before) {
      return notFound('Doctor');
    }

    const doctor = await Doctor.findOneAndUpdate(
      tenantFilter(tenantId, { _id: id }),
      { $set: resolved },
      { new: true, runValidators: true }
    ).populate('specializationId', 'name description category');
    if (!doctor) {
      return notFound('Doctor');
    }

    // Compared only on the fields sent; the form sends the whole profile, so most are unchanged.
    const after = doctor.toObject() as Record<string, any>;
    const sent = Object.fromEntries(Object.keys(resolved).map((k) => [k, after[k]]));
    const changes = await doctorChanges(before, sent);
    if (changes.length) {
      await logDoctorChange(ctx, request, {
        action: 'update',
        doctorId: doctor._id,
        description: changedSentence(doctorLabel(after), changes),
        changes,
      });
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
    if (error.code === 11000) return duplicateResponse(error);
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

    const doctor = await Doctor.findOne(tenantFilter(tenantId, { _id: id }))
      .select('_id title firstName lastName')
      .lean<{ _id: Types.ObjectId; title?: string; firstName: string; lastName: string } | null>();
    if (!doctor) {
      return notFound('Doctor');
    }

    const user = await User.findOne(tenantFilter(tenantId, { doctorProfile: doctor._id }))
      .select('_id role')
      .populate('role', 'name')
      .lean<{ _id: Types.ObjectId; role?: { name?: string } | null } | null>();

    // A doctor with patients on record is never deleted: their appointments, notes and
    // prescriptions would lose their doctor. Marking them inactive keeps the history.
    const actors = user ? [doctor._id, user._id] : [doctor._id];
    const [appointments, visits, prescriptions] = await Promise.all([
      Appointment.countDocuments(tenantFilter(tenantId, { doctor: doctor._id })),
      Visit.countDocuments(tenantFilter(tenantId, { provider: { $in: actors } })),
      Prescription.countDocuments(tenantFilter(tenantId, { prescribedBy: { $in: actors } })),
    ]);
    if (appointments + visits + prescriptions > 0) {
      await logDoctorChange(ctx, request, {
        action: 'delete',
        doctorId: doctor._id,
        description: `Tried to remove ${doctorLabel(doctor)}`,
        success: false,
        errorMessage: 'The doctor has appointments, visit notes or prescriptions on record',
        metadata: { appointments, visits, prescriptions },
      });
      return NextResponse.json(
        {
          success: false,
          error: 'This doctor has appointments, visit notes or prescriptions on record, so the profile can’t be deleted. Mark them inactive instead: they are signed out and can’t be booked, and the records keep their name.',
          records: { appointments, visits, prescriptions },
        },
        { status: 409 }
      );
    }

    await Doctor.deleteOne(tenantFilter(tenantId, { _id: doctor._id }));

    // The login goes with the profile only when it is a doctor-only account. Someone who added
    // themselves as a doctor (an admin, an owner) keeps their own login; it is just unlinked.
    let login: 'none' | 'removed' | 'unlinked' = 'none';
    if (user) {
      const ownLogin = String(user._id) === session.userId;
      if (!ownLogin && user.role?.name === 'doctor') {
        await User.deleteOne(tenantFilter(tenantId, { _id: user._id }));
        await revokeUserSessions(String(user._id));
        login = 'removed';
      } else {
        await User.updateOne(tenantFilter(tenantId, { _id: user._id }), { $unset: { doctorProfile: 1 } });
        login = 'unlinked';
      }
    }

    await logDoctorChange(ctx, request, {
      action: 'delete',
      doctorId: doctor._id,
      description: `Removed ${doctorLabel(doctor)}${login === 'removed' ? ' and their sign-in account' : login === 'unlinked' ? '; their sign-in account was kept' : ''}`,
    });

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    console.error('Error deleting doctor:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete doctor' },
      { status: 500 }
    );
  }
}
