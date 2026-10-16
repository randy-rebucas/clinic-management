import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import Appointment from '@/models/Appointment';
import { requirePermission } from '@/app/lib/auth-helpers';
import {
  requireTenantSession,
  isTenantSessionError,
  tenantFilter,
  isValidId,
  notFound,
} from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { parseDateParam } from '@/app/api/reports/_lib/report-range';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'doctors', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();

    const { id } = await params;
    if (!isValidId(id)) return notFound('Doctor');
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
      .select('firstName lastName specializationId performanceMetrics')
      .populate('specializationId', 'name description category')
      .lean() as any;
    if (!doctor) {
      return notFound('Doctor');
    }

    const appointmentMatch: Record<string, unknown> = tenantFilter(tenantId, { doctor: doctor._id });
    if (start || end) {
      appointmentMatch.appointmentDate = {
        ...(start ? { $gte: start } : {}),
        ...(end ? { $lte: end } : {}),
      };
    }

    const rows = await Appointment.aggregate([
      { $match: appointmentMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const countOf = (status: string) => rows.find((r: any) => r._id === status)?.count || 0;

    const totalAppointments = rows.reduce((sum: number, r: any) => sum + r.count, 0);
    const completedAppointments = countOf('completed');
    const cancelledAppointments = countOf('cancelled');
    const noShowAppointments = countOf('no-show');

    // Calculate completion rate
    const completionRate = totalAppointments > 0 
      ? (completedAppointments / totalAppointments) * 100 
      : 0;

    // Calculate cancellation rate
    const cancellationRate = totalAppointments > 0 
      ? (cancelledAppointments / totalAppointments) * 100 
      : 0;

    // Calculate no-show rate
    const noShowRate = totalAppointments > 0 
      ? (noShowAppointments / totalAppointments) * 100 
      : 0;

    // Update doctor's performance metrics
    await Doctor.updateOne(tenantFilter(tenantId, { _id: doctor._id }), {
      $set: {
        'performanceMetrics.totalAppointments': totalAppointments,
        'performanceMetrics.completedAppointments': completedAppointments,
        'performanceMetrics.cancelledAppointments': cancelledAppointments,
        'performanceMetrics.noShowAppointments': noShowAppointments,
        'performanceMetrics.lastUpdated': new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        doctor: {
          _id: doctor._id,
          name: `${doctor.firstName} ${doctor.lastName}`,
          specialization: doctor.specializationId?.name || 'Unknown',
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
      },
    });
  } catch (error: any) {
    console.error('Error fetching performance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch performance data' },
      { status: 500 }
    );
  }
}

