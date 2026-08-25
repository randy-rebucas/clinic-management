import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listDoctorsFull, createDoctor } from '@/lib/data/doctor';
import prisma from '@/lib/prisma';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET() {
  // User authentication check
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
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const doctors = await run(tenantId, () => listDoctorsFull());

    return NextResponse.json({ success: true, data: doctors });
  } catch (error: any) {
    console.error('Error fetching doctors:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch doctors' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // User authentication check
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to write/create doctors (typically admin only)
  const permissionCheck = await requirePermission(session, 'doctors', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const body = await request.json();

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const doctor = await run(tenantId, async () => {
      // Check subscription limit for creating doctors
      if (tenantId) {
        const { checkSubscriptionLimit } = await import('@/lib/subscription-limits');
        const limitCheck = await checkSubscriptionLimit(tenantId, 'createDoctor');
        if (!limitCheck.allowed) {
          return {
            limitExceeded: true as const,
            reason: limitCheck.reason,
            limit: limitCheck.limit,
            current: limitCheck.current,
            remaining: limitCheck.remaining,
          };
        }
      }

      // Handle specialization: convert specialization string to specializationId
      if (body.specialization && !body.specializationId) {
        const specializationName = body.specialization.trim();

        if (!specializationName) {
          return { validationError: 'Specialization is required' as const };
        }

        // Find or create specialization globally (not tenant-scoped)
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

      // Validate that specializationId exists
      if (!body.specializationId) {
        return { validationError: 'Specialization is required' as const };
      }

      const created = await createDoctor({
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        licenseNumber: body.licenseNumber,
        ptr: body.ptr,
        title: body.title,
        qualifications: body.qualifications,
        bio: body.bio,
        department: body.department,
        status: body.status,
        specialization: { connect: { id: body.specializationId } },
        ...(Array.isArray(body.schedule)
          ? {
              schedule: {
                create: body.schedule.map((s: any) => ({
                  dayOfWeek: s.dayOfWeek,
                  startTime: s.startTime,
                  endTime: s.endTime,
                  isAvailable: s.isAvailable ?? true,
                })),
              },
            }
          : {}),
      });

      return { created };
    });

    if ('limitExceeded' in doctor) {
      return NextResponse.json(
        {
          success: false,
          error: doctor.reason || 'Subscription limit exceeded',
          limit: doctor.limit,
          current: doctor.current,
          remaining: doctor.remaining,
        },
        { status: 403 }
      );
    }

    if ('validationError' in doctor) {
      return NextResponse.json({ success: false, error: doctor.validationError }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: doctor.created }, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'Doctor with this email or license number already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create doctor' },
      { status: 500 }
    );
  }
}
