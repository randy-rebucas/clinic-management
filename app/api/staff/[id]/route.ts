import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import {
  findStaffById,
  getUserForStaff,
  updateStaffProfile,
  updateUserForStaff,
  deleteStaffProfile,
  deleteUserForStaff,
  StaffType,
} from '@/lib/data/staff';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// GET /api/staff/[id] - Get a specific staff member
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { id } = await params;

    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid staff ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const staffType = searchParams.get('type') as StaffType | null;

    const result = await run(tenantId, async () => {
      const found = await findStaffById(id, staffType);
      if (!found) return null;
      const user = await getUserForStaff(id, found.staffType);
      return { staff: found.staff, staffType: found.staffType, user };
    });

    if (!result) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    return NextResponse.json({
      staff: { ...result.staff, staffType: result.staffType },
      user: result.user,
    });
  } catch (error: any) {
    console.error('Error fetching staff:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch staff' }, { status: 500 });
  }
}

// PUT /api/staff/[id] - Update a staff member
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can update staff' }, { status: 403 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { id } = await params;

    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid staff ID' }, { status: 400 });
    }

    const body = await request.json();
    const { staffType, ...updateData } = body;

    if (!staffType) {
      return NextResponse.json({ error: 'Staff type is required' }, { status: 400 });
    }

    if (!['nurse', 'receptionist', 'accountant'].includes(staffType)) {
      return NextResponse.json({ error: 'Invalid staff type' }, { status: 400 });
    }

    // Remove fields that shouldn't be updated directly
    delete updateData._id;
    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    const result = await run(tenantId, async () => {
      let staff;
      try {
        staff = await updateStaffProfile(staffType, id, updateData);
      } catch (err: any) {
        if (err.code === 'P2025') return { notFound: true as const };
        throw err;
      }

      // Update associated user if email or name changed
      if (updateData.email || updateData.firstName || updateData.lastName || updateData.status) {
        const userUpdate: Record<string, any> = {};
        if (updateData.email) userUpdate.email = updateData.email.toLowerCase().trim();
        if (updateData.firstName || updateData.lastName) {
          userUpdate.name = `${updateData.firstName || staff.firstName} ${updateData.lastName || staff.lastName}`.trim();
        }
        if (updateData.status) {
          userUpdate.status = updateData.status === 'active' ? 'active' : 'inactive';
        }

        if (Object.keys(userUpdate).length > 0) {
          await updateUserForStaff(id, staffType, userUpdate);
        }
      }

      return { staff };
    });

    if ('notFound' in result) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Staff member updated successfully',
      staff: { ...result.staff, staffType },
    });
  } catch (error: any) {
    console.error('Error updating staff:', error);
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'A staff member with this email already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Failed to update staff' }, { status: 500 });
  }
}

// DELETE /api/staff/[id] - Delete a staff member
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await verifySession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can delete staff' }, { status: 403 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { id } = await params;

    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid staff ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const staffType = searchParams.get('type') as StaffType | null;

    if (!staffType) {
      return NextResponse.json({ error: 'Staff type is required' }, { status: 400 });
    }

    if (!['nurse', 'receptionist', 'accountant'].includes(staffType)) {
      return NextResponse.json({ error: 'Invalid staff type' }, { status: 400 });
    }

    const result = await run(tenantId, async () => {
      try {
        await deleteStaffProfile(staffType, id);
      } catch (err: any) {
        if (err.code === 'P2025') return { notFound: true as const };
        throw err;
      }

      // Also delete associated user
      await deleteUserForStaff(id, staffType);
      return { deleted: true as const };
    });

    if ('notFound' in result) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Staff member deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting staff:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete staff' }, { status: 500 });
  }
}
