import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getDoctorByIdFull, updateDoctor, deleteDoctor } from '@/lib/data/doctor';
import prisma from '@/lib/prisma';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read doctors
  const permissionCheck = await requirePermission(session, 'doctors', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { id } = await params;
    const doctor = await run(tenantId, () => getDoctorByIdFull(id));
    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: doctor });
  } catch (error) {
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
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to update doctors
  const permissionCheck = await requirePermission(session, 'doctors', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const doctor = await run(tenantId, async () => {
      // Handle specialization: convert specialization string to specializationId
      if (body.specialization && !body.specializationId) {
        const specializationName = body.specialization.trim();

        if (!specializationName) {
          return { validationError: 'Specialization is required' as const };
        }

        let specialization = await prisma.specialization.findUnique({ where: { name: specializationName } });

        if (!specialization) {
          specialization = await prisma.specialization.create({
            data: {
              name: specializationName,
              active: true,
              category: 'Specialty', // Default category for custom specializations
            },
          });
        }

        body.specializationId = specialization.id;
        delete body.specialization;
      }

      const {
        _id,
        id: bodyId,
        tenantId: bodyTenantId,
        createdAt,
        updatedAt,
        schedule,
        availabilityOverrides,
        internalNotes,
        specializationId,
        ...updateData
      } = body;

      try {
        return {
          updated: await updateDoctor(id, {
            ...updateData,
            ...(specializationId ? { specialization: { connect: { id: specializationId } } } : {}),
          }),
        };
      } catch (err: any) {
        if (err.code === 'P2025') {
          return { notFound: true as const };
        }
        throw err;
      }
    });

    if ('validationError' in doctor) {
      return NextResponse.json({ success: false, error: doctor.validationError }, { status: 400 });
    }

    if ('notFound' in doctor) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: doctor.updated });
  } catch (error: any) {
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
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to delete doctors (only doctors or admins can delete)
  const permissionCheck = await requirePermission(session, 'doctors', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const result = await run(tenantId, async () => {
      // Find the doctor first
      const doctor = await prisma.doctor.findUnique({ where: { id } });
      if (!doctor) {
        return { notFound: true as const };
      }

      // Delete associated User if exists
      const user = await prisma.user.findUnique({ where: { doctorProfileId: id } });
      if (user) {
        await prisma.user.delete({ where: { id: user.id } });
      }

      // Delete the doctor
      await deleteDoctor(id);
      return { deleted: true as const };
    });

    if ('notFound' in result) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
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
