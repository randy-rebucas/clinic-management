import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import { isAdmin } from '@/app/lib/auth-helpers';
import {
  requireTenantSession,
  isTenantSessionError,
  tenantFilter,
  isValidId,
  notFound,
} from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { parseDateParam } from '@/app/api/reports/_lib/report-range';
import { computeDoctorStats } from '../../_lib/doctor-stats';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Doctor');

    // Admins and accountants see any doctor; a doctor only sees their own report.
    if (!isAdmin(session) && session.role !== 'accountant') {
      const user = session.role === 'doctor'
        ? await User.findOne(tenantFilter(tenantId, { _id: session.userId })).select('doctorProfile').lean() as any
        : null;
      if (!user?.doctorProfile || String(user.doctorProfile) !== id) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
      }
    }

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const tz = await getTenantTimezone(tenantId);
    const start = parseDateParam(startDate, tz, 'start');
    const end = parseDateParam(endDate, tz, 'end');
    if ((startDate && !start) || (endDate && !end)) {
      return NextResponse.json({ success: false, error: 'Invalid date range' }, { status: 400 });
    }

    const doctor = await Doctor.findOne(tenantFilter(tenantId, { _id: id }))
      .populate('specializationId', 'name description category')
      .lean() as any;
    if (!doctor) {
      return notFound('Doctor');
    }

    const s = (await computeDoctorStats(tenantId, [doctor._id], { start, end })).get(String(doctor._id))!;

    const totalAppointments = s.totalAppointments;
    const completedAppointments = s.appointmentsByStatus.completed || 0;
    const cancelledAppointments = s.appointmentsByStatus.cancelled || 0;
    const noShowAppointments = s.appointmentsByStatus['no-show'] || 0;
    const scheduledAppointments = (s.appointmentsByStatus.scheduled || 0) + (s.appointmentsByStatus.confirmed || 0);

    const totalVisits = s.totalVisits;
    const completedVisits = s.visitsByStatus.closed || 0;
    const openVisits = s.visitsByStatus.open || 0;

    const totalPrescriptions = s.totalPrescriptions;
    const activePrescriptions = s.prescriptionsByStatus.active || 0;
    const dispensedPrescriptions = s.prescriptionsByStatus.dispensed || 0;

    const totalRevenue = s.totalRevenue;
    const totalBilled = s.totalBilled;
    const outstandingRevenue = s.outstandingRevenue;

    // Calculate average appointments per day
    const daysDiff = start && end
      ? Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
      : 30; // Default to 30 days if no range specified
    const avgAppointmentsPerDay = daysDiff > 0 ? (totalAppointments / daysDiff).toFixed(2) : 0;

    // Calculate completion rate
    const completionRate = totalAppointments > 0
      ? ((completedAppointments / totalAppointments) * 100).toFixed(2)
      : 0;

    // Calculate no-show rate
    const noShowRate = totalAppointments > 0
      ? ((noShowAppointments / totalAppointments) * 100).toFixed(2)
      : 0;

    // Get appointment status breakdown
    const appointmentStatusBreakdown = {
      scheduled: s.appointmentsByStatus.scheduled || 0,
      confirmed: s.appointmentsByStatus.confirmed || 0,
      completed: completedAppointments,
      cancelled: cancelledAppointments,
      noShow: noShowAppointments,
    };

    // Get visit type breakdown
    const visitTypeBreakdown = s.visitsByType;

    // Get prescription status breakdown
    const prescriptionStatusBreakdown = s.prescriptionsByStatus;

    // Time-based metrics (if date range provided)
    const timeBasedMetrics = startDate && endDate ? {
      period: {
        startDate,
        endDate,
        days: daysDiff,
      },
      dailyAverage: {
        appointments: parseFloat(String(avgAppointmentsPerDay || 0)),
        visits: (totalVisits / daysDiff).toFixed(2),
        prescriptions: (totalPrescriptions / daysDiff).toFixed(2),
        revenue: (totalRevenue / daysDiff).toFixed(2),
      },
    } : null;

    const productivityReport = {
      doctor: {
        _id: doctor._id,
        name: `${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.specializationId?.name || 'Unknown',
        status: doctor.status,
      },
      period: startDate && endDate ? { startDate, endDate } : { allTime: true },
      summary: {
        totalAppointments,
        completedAppointments,
        cancelledAppointments,
        noShowAppointments,
        scheduledAppointments,
        totalVisits,
        completedVisits,
        openVisits,
        totalPrescriptions,
        activePrescriptions,
        dispensedPrescriptions,
        totalRevenue,
        totalBilled,
        outstandingRevenue,
      },
      metrics: {
        completionRate: parseFloat(String(completionRate || 0)),
        noShowRate: parseFloat(String(noShowRate || 0)),
        avgAppointmentsPerDay: parseFloat(String(avgAppointmentsPerDay || 0)),
        revenuePerVisit: totalVisits > 0 ? (totalRevenue / totalVisits).toFixed(2) : 0,
        prescriptionsPerVisit: totalVisits > 0 ? (totalPrescriptions / totalVisits).toFixed(2) : 0,
      },
      breakdowns: {
        appointmentStatus: appointmentStatusBreakdown,
        visitType: visitTypeBreakdown,
        prescriptionStatus: prescriptionStatusBreakdown,
      },
      timeBased: timeBasedMetrics,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, data: productivityReport });
  } catch (error: any) {
    console.error('Error generating productivity report:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate productivity report' },
      { status: 500 }
    );
  }
}

