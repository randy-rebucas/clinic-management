import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import Invoice from '@/models/Invoice';
import Doctor from '@/models/Doctor';
import { requirePermission } from '@/app/lib/auth-helpers';
import {
  requireTenantSession,
  isTenantSessionError,
  tenantFilter,
  patientTenantFilter,
} from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { dayRangeInTz, dayRangeOffsetInTz } from '@/lib/tz';
import { periodRange } from '../_lib/report-range';

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'reports', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'today'; // today, week, month
    const tz = await getTenantTimezone(tenantId);

    const now = new Date();
    const dateRange = period === 'week'
      ? periodRange('weekly', tz, now)
      : period === 'month'
        ? periodRange('monthly', tz, now)
        : periodRange('daily', tz, now);

    const { start: todayStart, end: todayEnd } = dayRangeInTz(now, tz);
    const scope = tenantFilter(tenantId);

    const [
      totalPatients,
      totalDoctors,
      todayAppointments,
      periodAppointments,
      periodVisits,
      periodInvoiceAgg,
      outstandingAgg,
      paymentAgg,
    ] = await Promise.all([
      Patient.countDocuments(patientTenantFilter(tenantId)),
      Doctor.countDocuments({ ...scope, status: 'active' }),
      Appointment.countDocuments({
        ...scope,
        appointmentDate: { $gte: todayStart, $lte: todayEnd },
        status: { $in: ['scheduled', 'confirmed'] },
      }),
      Appointment.countDocuments({
        ...scope,
        appointmentDate: { $gte: dateRange.start, $lte: dateRange.end },
      }),
      Visit.countDocuments({
        ...scope,
        date: { $gte: dateRange.start, $lte: dateRange.end },
        status: { $ne: 'cancelled' },
      }),
      Invoice.aggregate([
        { $match: { ...scope, createdAt: { $gte: dateRange.start, $lte: dateRange.end } } },
        { $group: { _id: null, revenue: { $sum: { $ifNull: ['$totalPaid', 0] } }, billed: { $sum: { $ifNull: ['$total', 0] } } } },
      ]),
      Invoice.aggregate([
        { $match: { ...scope, status: { $in: ['unpaid', 'partial'] } } },
        { $group: { _id: null, outstanding: { $sum: { $ifNull: ['$outstandingBalance', 0] } }, count: { $sum: 1 } } },
      ]),
      Invoice.aggregate([
        { $match: { ...scope, createdAt: { $gte: dateRange.start, $lte: dateRange.end } } },
        { $unwind: '$payments' },
        { $group: { _id: { $ifNull: ['$payments.method', 'unknown'] }, amount: { $sum: { $ifNull: ['$payments.amount', 0] } } } },
      ]),
    ]);

    const periodRevenue = periodInvoiceAgg[0]?.revenue || 0;
    const periodBilled = periodInvoiceAgg[0]?.billed || 0;
    const totalOutstanding = outstandingAgg[0]?.outstanding || 0;
    const outstandingInvoiceCount = outstandingAgg[0]?.count || 0;

    const recentAppointments = await Appointment.find({
      ...scope,
      appointmentDate: { $gte: todayStart, $lte: todayEnd },
    })
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName')
      .sort({ appointmentTime: 1 })
      .limit(10)
      .lean();

    const nextWeek = dayRangeOffsetInTz(7, now, tz).end;
    const upcomingAppointments = await Appointment.find({
      ...scope,
      appointmentDate: { $gt: todayEnd, $lte: nextWeek },
      status: { $in: ['scheduled', 'confirmed'] },
    })
      .populate('patient', 'firstName lastName')
      .populate('doctor', 'firstName lastName')
      .sort({ appointmentDate: 1, appointmentTime: 1 })
      .limit(10)
      .lean();

    const paymentMethodBreakdown: Record<string, number> = {};
    paymentAgg.forEach((row: any) => {
      paymentMethodBreakdown[row._id] = row.amount;
    });

    return NextResponse.json({
      success: true,
      data: {
        period,
        dateRange: {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString(),
        },
        overview: {
          totalPatients,
          totalDoctors,
          todayAppointments,
          periodAppointments,
          periodVisits,
          periodRevenue: parseFloat(periodRevenue.toFixed(2)),
          periodBilled: parseFloat(periodBilled.toFixed(2)),
          totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
          outstandingInvoiceCount,
        },
        recentAppointments: recentAppointments.map((apt: any) => ({
          _id: apt._id,
          appointmentCode: apt.appointmentCode,
          patient: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown',
          doctor: apt.doctor ? `Dr. ${apt.doctor.firstName} ${apt.doctor.lastName}` : 'TBD',
          date: apt.appointmentDate,
          time: apt.appointmentTime,
          status: apt.status,
        })),
        upcomingAppointments: upcomingAppointments.map((apt: any) => ({
          _id: apt._id,
          appointmentCode: apt.appointmentCode,
          patient: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown',
          doctor: apt.doctor ? `Dr. ${apt.doctor.firstName} ${apt.doctor.lastName}` : 'TBD',
          date: apt.appointmentDate,
          time: apt.appointmentTime,
          status: apt.status,
        })),
        paymentMethodBreakdown,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error generating dashboard data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate dashboard data' },
      { status: 500 }
    );
  }
}

