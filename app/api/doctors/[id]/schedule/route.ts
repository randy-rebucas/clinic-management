import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getDoctorScheduleData, replaceDoctorSchedule } from '@/lib/data/doctor';

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

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const doctor = await run(tenantId, () => getDoctorScheduleData(id));

    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }

    // Get schedule for specific date range if provided
    const scheduleData: { weeklySchedule: any[]; availabilityOverrides: any[] } = {
      weeklySchedule: doctor.schedule || [],
      availabilityOverrides: doctor.availabilityOverrides || [],
    };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Filter overrides for the date range
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
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin or the doctor themselves can update schedule
  if (session.role !== 'admin' && session.role !== 'doctor') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { id } = await params;
    const body = await request.json();

    const doctor = await run(tenantId, async () => {
      try {
        return await replaceDoctorSchedule(id, body.schedule, body.availabilityOverrides);
      } catch (err: any) {
        if (err.code === 'P2025') {
          return null;
        }
        throw err;
      }
    });

    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: doctor });
  } catch (error: any) {
    console.error('Error updating doctor schedule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update doctor schedule' },
      { status: 500 }
    );
  }
}
