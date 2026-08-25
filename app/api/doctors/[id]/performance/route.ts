import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getDoctorByIdFull, listDoctorAppointments, updateDoctorPerformanceMetrics } from '@/lib/data/doctor';

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

    const result = await run(tenantId, async () => {
      const doctor = await getDoctorByIdFull(id);
      if (!doctor) return { notFound: true as const };

      const dateRange: { startDate?: Date; endDate?: Date } = {};
      if (startDate) dateRange.startDate = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateRange.endDate = end;
      }

      const appointments = await listDoctorAppointments(id, dateRange);

      const totalAppointments = appointments.length;
      const completedAppointments = appointments.filter((apt) => apt.status === 'completed').length;
      const cancelledAppointments = appointments.filter((apt) => apt.status === 'cancelled').length;
      const noShowAppointments = appointments.filter((apt) => apt.status === 'no_show').length;

      const completionRate = totalAppointments > 0 ? (completedAppointments / totalAppointments) * 100 : 0;
      const cancellationRate = totalAppointments > 0 ? (cancelledAppointments / totalAppointments) * 100 : 0;
      const noShowRate = totalAppointments > 0 ? (noShowAppointments / totalAppointments) * 100 : 0;

      await updateDoctorPerformanceMetrics(id, {
        totalAppointments,
        completedAppointments,
        cancelledAppointments,
        noShowAppointments,
        averageRating: doctor.perfAverageRating ?? undefined,
      });

      return {
        doctor: {
          _id: doctor.id,
          name: `${doctor.firstName} ${doctor.lastName}`,
          specialization: doctor.specialization?.name || 'Unknown',
        },
        metrics: {
          totalAppointments,
          completedAppointments,
          cancelledAppointments,
          noShowAppointments,
          completionRate: Math.round(completionRate * 100) / 100,
          cancellationRate: Math.round(cancellationRate * 100) / 100,
          noShowRate: Math.round(noShowRate * 100) / 100,
        },
        period: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
      };
    });

    if ('notFound' in result) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error fetching performance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch performance data' },
      { status: 500 }
    );
  }
}
