import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import { Nurse, Receptionist, Accountant, User } from '@/models';
import { isAdmin } from '@/app/lib/auth-helpers';
import { revokeUserSessions } from '@/app/lib/dal';
import { requireTenantSession, isTenantSessionError, tenantFilter, isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zEmail, zPhone, zShortText } from '@/lib/api/validate';

const STAFF_TYPES = ['nurse', 'receptionist', 'accountant'] as const;

const optionalText = z.preprocess((v) => (v === null ? undefined : v), zShortText.optional());

const updateStaffSchema = z.object({
  staffType: z.enum(STAFF_TYPES),
  firstName: zShortText.min(1).optional(),
  lastName: zShortText.min(1).optional(),
  email: zEmail.optional(),
  phone: zPhone.optional(),
  employeeId: optionalText,
  department: optionalText,
  specialization: optionalText,
  licenseNumber: optionalText,
  certification: optionalText,
  title: optionalText,
  address: z.preprocess((v) => (v === null ? undefined : v), z.string().trim().max(500).optional()),
  bio: z.preprocess((v) => (v === null ? undefined : v), z.string().max(5000).optional()),
  hireDate: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.date().optional()
  ),
  status: z.enum(['active', 'inactive', 'on-leave']).optional(),
});

function getModelByType(staffType: string | null) {
  switch (staffType) {
    case 'nurse': return Nurse;
    case 'receptionist': return Receptionist;
    case 'accountant': return Accountant;
    default: return null;
  }
}

function getProfileField(staffType: string | null) {
  switch (staffType) {
    case 'nurse': return 'nurseProfile';
    case 'receptionist': return 'receptionistProfile';
    case 'accountant': return 'accountantProfile';
    default: return null;
  }
}

async function revokeSessionsFor(userId: unknown) {
  if (!userId) return;
  await revokeUserSessions(String(userId));
}

// GET /api/staff/[id] - Get a specific staff member
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { tenantId } = ctx;

    await connectDB();
    const { id } = await params;

    if (!isValidId(id)) {
      return NextResponse.json({ error: 'Invalid staff ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const staffType = searchParams.get('type');
    const filter = tenantFilter(tenantId, { _id: id });

    let staff = null;
    let foundType = staffType;

    if (staffType) {
      const Model = getModelByType(staffType);
      if (Model) {
        staff = await Model.findOne(filter).lean();
      }
    } else {
      staff = await Nurse.findOne(filter).lean();
      if (staff) {
        foundType = 'nurse';
      } else {
        staff = await Receptionist.findOne(filter).lean();
        if (staff) {
          foundType = 'receptionist';
        } else {
          staff = await Accountant.findOne(filter).lean();
          if (staff) {
            foundType = 'accountant';
          }
        }
      }
    }

    if (!staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    const profileField = getProfileField(foundType);
    const user = profileField
      ? await User.findOne(tenantFilter(tenantId, { [profileField]: id })).select('email name status lastLogin').lean()
      : null;

    return NextResponse.json({
      staff: { ...staff, staffType: foundType },
      user,
    });
  } catch (error: any) {
    console.error('Error fetching staff:', error);
    return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 });
  }
}

// PUT /api/staff/[id] - Update a staff member
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantId } = ctx;

    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Only admins can update staff' }, { status: 403 });
    }

    await connectDB();
    const { id } = await params;

    if (!isValidId(id)) {
      return NextResponse.json({ error: 'Invalid staff ID' }, { status: 400 });
    }

    const parsed = await parseBody(request, updateStaffSchema);
    if (isValidationError(parsed)) return parsed;
    const { staffType, ...updateData } = parsed.data;

    const Model = getModelByType(staffType)!;
    const profileField = getProfileField(staffType)!;

    if (updateData.email) {
      const emailOwner = await User.findOne({ email: updateData.email })
        .select('tenantId ' + profileField)
        .lean<Record<string, unknown> | null>();
      if (
        emailOwner &&
        (String(emailOwner.tenantId ?? '') !== tenantId || String(emailOwner[profileField] ?? '') !== id)
      ) {
        return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 });
      }
    }

    const staff = await Model.findOneAndUpdate(
      tenantFilter(tenantId, { _id: id }),
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    const userUpdate: Record<string, unknown> = {};
    if (updateData.email) userUpdate.email = updateData.email;
    if (updateData.firstName || updateData.lastName) {
      userUpdate.name = `${updateData.firstName || (staff as any).firstName} ${updateData.lastName || (staff as any).lastName}`.trim();
    }
    if (updateData.status) {
      userUpdate.status = updateData.status === 'active' ? 'active' : 'inactive';
    }

    if (Object.keys(userUpdate).length > 0) {
      const user = await User.findOneAndUpdate(
        tenantFilter(tenantId, { [profileField]: id }),
        { $set: userUpdate },
        { new: true }
      ).select('_id status').lean<{ _id: unknown; status?: string } | null>();

      if (user && (userUpdate.status === 'inactive' || userUpdate.email)) {
        await revokeSessionsFor(user._id);
      }
    }

    return NextResponse.json({
      message: 'Staff member updated successfully',
      staff: { ...staff, staffType },
    });
  } catch (error: any) {
    console.error('Error updating staff:', error);
    if (error.code === 11000) {
      return NextResponse.json({ error: 'A staff member with this email already exists' }, { status: 400 });
    }
    if (error.name === 'ValidationError') {
      return NextResponse.json({ error: 'Invalid staff data' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to update staff' }, { status: 500 });
  }
}

// DELETE /api/staff/[id] - Delete a staff member
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantId } = ctx;

    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Only admins can delete staff' }, { status: 403 });
    }

    await connectDB();
    const { id } = await params;

    if (!isValidId(id)) {
      return NextResponse.json({ error: 'Invalid staff ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const staffType = searchParams.get('type');

    if (!staffType) {
      return NextResponse.json({ error: 'Staff type is required' }, { status: 400 });
    }

    const Model = getModelByType(staffType);
    const profileField = getProfileField(staffType);
    if (!Model || !profileField) {
      return NextResponse.json({ error: 'Invalid staff type' }, { status: 400 });
    }

    const staff = await Model.findOneAndDelete(tenantFilter(tenantId, { _id: id }));

    if (!staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    const deletedUser = await User.findOneAndDelete(tenantFilter(tenantId, { [profileField]: id }))
      .select('_id')
      .lean<{ _id: unknown } | null>();
    if (deletedUser) {
      await revokeSessionsFor(deletedUser._id);
    }

    return NextResponse.json({
      message: 'Staff member deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting staff:', error);
    return NextResponse.json({ error: 'Failed to delete staff' }, { status: 500 });
  }
}
