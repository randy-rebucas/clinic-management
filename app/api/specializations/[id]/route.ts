import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { runAsSystem } from '@/lib/tenant-context';
import {
  getSpecializationById,
  findSpecializationNameConflict,
  updateSpecialization,
  deleteSpecialization,
  countDoctorsUsingSpecialization,
} from '@/lib/data/specialization';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/specializations/[id]
 *
 * Fetch a single specialization by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid specialization ID' },
        { status: 400 }
      );
    }

    const specialization = await runAsSystem(() => getSpecializationById(id));

    if (!specialization) {
      return NextResponse.json(
        { success: false, error: 'Specialization not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: specialization });
  } catch (error: any) {
    console.error('Error fetching specialization:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch specialization' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/specializations/[id]
 *
 * Update a specialization.
 * Requires admin privileges.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check if user is admin
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Only admins can update specializations' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid specialization ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, description, category, active } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim();
    if (category !== undefined) updateData.category = category?.trim();
    if (active !== undefined) updateData.active = active;

    const result = await runAsSystem(async () => {
      // Check if name is being changed and if it conflicts with existing
      if (name) {
        const existing = await findSpecializationNameConflict(name.trim(), id);
        if (existing) {
          return { conflict: true as const };
        }
      }

      try {
        const specialization = await updateSpecialization(id, updateData);
        return { conflict: false as const, specialization };
      } catch (error: any) {
        if (error.code === 'P2025') {
          return { conflict: false as const, specialization: null };
        }
        throw error;
      }
    });

    if (result.conflict) {
      return NextResponse.json(
        { success: false, error: 'A specialization with this name already exists' },
        { status: 400 }
      );
    }

    if (!result.specialization) {
      return NextResponse.json(
        { success: false, error: 'Specialization not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: result.specialization });
  } catch (error: any) {
    console.error('Error updating specialization:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update specialization' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/specializations/[id]
 *
 * Delete a specialization.
 * Requires admin privileges.
 * Note: This will fail if doctors are using this specialization.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check if user is admin
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Only admins can delete specializations' },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;

    if (!UUID_RE.test(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid specialization ID' },
        { status: 400 }
      );
    }

    const result = await runAsSystem(async () => {
      // Check if any doctors (across all tenants — Specialization is global)
      // are using this specialization.
      const doctorCount = await countDoctorsUsingSpecialization(id);
      if (doctorCount > 0) {
        return { doctorCount };
      }

      try {
        await deleteSpecialization(id);
        return { deleted: true as const };
      } catch (error: any) {
        if (error.code === 'P2025') {
          return { deleted: false as const };
        }
        throw error;
      }
    });

    if ('doctorCount' in result) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete specialization. ${result.doctorCount} doctor(s) are currently using it.`
        },
        { status: 400 }
      );
    }

    if (!result.deleted) {
      return NextResponse.json(
        { success: false, error: 'Specialization not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Specialization deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting specialization:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete specialization' },
      { status: 500 }
    );
  }
}
