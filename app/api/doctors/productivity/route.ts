import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import { isAdmin } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { parseDateParam } from '@/app/api/reports/_lib/report-range';
import { computeDoctorStats } from '../_lib/doctor-stats';

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  // Only admin and accountants can view all doctor productivity
  if (!isAdmin(session) && session.role !== 'accountant') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const tz = await getTenantTimezone(tenantId);

    const start = parseDateParam(startDate, tz, 'start');
    const end = parseDateParam(endDate, tz, 'end');
    if ((startDate && !start) || (endDate && !end)) {
      return NextResponse.json({ success: false, error: 'Invalid date range' }, { status: 400 });
    }

    const doctors = await Doctor.find(tenantFilter(tenantId, { status: 'active' }))
      .select('firstName lastName specializationId')
      .populate('specializationId', 'name description category')
      .lean() as any[];

    const stats = await computeDoctorStats(tenantId, doctors.map((d) => d._id), { start, end });

    const productivityReports = doctors.map((doctor) => {
      const s = stats.get(String(doctor._id))!;
      const completedAppointments = s.appointmentsByStatus.completed || 0;
      return {
        doctor: {
          _id: doctor._id,
          name: `${doctor.firstName} ${doctor.lastName}`,
          specialization: doctor.specializationId?.name || 'Unknown',
        },
        summary: {
          totalAppointments: s.totalAppointments,
          completedAppointments,
          totalVisits: s.totalVisits,
          totalPrescriptions: s.totalPrescriptions,
          totalRevenue: s.totalRevenue,
        },
        metrics: {
          completionRate: s.totalAppointments > 0
            ? ((completedAppointments / s.totalAppointments) * 100).toFixed(2)
            : 0,
        },
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        period: startDate && endDate ? { startDate, endDate } : { allTime: true },
        reports: productivityReports,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error generating productivity reports:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate productivity reports' },
      { status: 500 }
    );
  }
}
