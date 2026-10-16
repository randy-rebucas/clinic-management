import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import Invoice from '@/models/Invoice';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import { hasPermission } from '@/app/lib/auth-helpers';
import {
  requireTenantSession,
  isTenantSessionError,
  tenantFilter as buildTenantFilter,
  patientTenantFilter,
} from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { dayRangeInTz, dayRangeOffsetInTz } from '@/lib/tz';
import { periodRange } from '../../_lib/report-range';

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

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

    const [
      canViewPatients,
      canViewAppointments,
      canViewVisits,
      canViewInvoices,
      canViewDoctors,
      canViewPrescriptions,
      canViewLabResults,
      canViewReports,
    ] = await Promise.all([
      hasPermission(session, 'patients', 'read'),
      hasPermission(session, 'appointments', 'read'),
      hasPermission(session, 'visits', 'read'),
      hasPermission(session, 'invoices', 'read'),
      hasPermission(session, 'doctors', 'read'),
      hasPermission(session, 'prescriptions', 'read'),
      hasPermission(session, 'lab-results', 'read'),
      hasPermission(session, 'reports', 'read'),
    ]);

    const overview: any = {};
    const data: any = {
      period,
      dateRange: {
        start: dateRange.start.toISOString(),
        end: dateRange.end.toISOString(),
      },
      overview,
      permissions: {
        canViewPatients,
        canViewAppointments,
        canViewVisits,
        canViewInvoices,
        canViewDoctors,
        canViewPrescriptions,
        canViewLabResults,
        canViewReports,
      },
    };

    const tenantFilter = buildTenantFilter(tenantId);
    const periodInvoiceMatch = { ...tenantFilter, createdAt: { $gte: dateRange.start, $lte: dateRange.end } };

    const promises: Promise<any>[] = [];

    if (canViewPatients) {
      promises.push(Patient.countDocuments(patientTenantFilter(tenantId)).then(count => ({ totalPatients: count })));
    }

    if (canViewDoctors) {
      promises.push(Doctor.countDocuments({ ...tenantFilter, status: 'active' }).then(count => ({ totalDoctors: count })));
    }

    if (canViewAppointments) {
      promises.push(
        Appointment.countDocuments({
          ...tenantFilter,
          appointmentDate: { $gte: todayStart, $lte: todayEnd },
          status: { $in: ['scheduled', 'confirmed'] },
        }).then(count => ({ todayAppointments: count })),
        Appointment.countDocuments({
          ...tenantFilter,
          appointmentDate: { $gte: dateRange.start, $lte: dateRange.end },
        }).then(count => ({ periodAppointments: count }))
      );
    }

    if (canViewVisits) {
      promises.push(
        Visit.countDocuments({
          ...tenantFilter,
          date: { $gte: dateRange.start, $lte: dateRange.end },
          status: { $ne: 'cancelled' },
        }).then(count => ({ periodVisits: count }))
      );
    }

    let paymentMethodBreakdown: Record<string, number> = {};

    if (canViewInvoices) {
      promises.push(
        Invoice.aggregate([
          { $match: periodInvoiceMatch },
          { $group: { _id: null, revenue: { $sum: { $ifNull: ['$totalPaid', 0] } }, billed: { $sum: { $ifNull: ['$total', 0] } } } },
        ]).then(rows => ({ periodRevenue: rows[0]?.revenue || 0, periodBilled: rows[0]?.billed || 0 })),
        Invoice.aggregate([
          { $match: { ...tenantFilter, status: { $in: ['unpaid', 'partial'] } } },
          { $group: { _id: null, outstanding: { $sum: { $ifNull: ['$outstandingBalance', 0] } }, count: { $sum: 1 } } },
        ]).then(rows => ({ totalOutstanding: rows[0]?.outstanding || 0, outstandingInvoiceCount: rows[0]?.count || 0 })),
        Invoice.aggregate([
          { $match: periodInvoiceMatch },
          { $unwind: '$payments' },
          { $group: { _id: { $ifNull: ['$payments.method', 'unknown'] }, amount: { $sum: { $ifNull: ['$payments.amount', 0] } } } },
        ]).then(rows => {
          paymentMethodBreakdown = Object.fromEntries(rows.map((row: any) => [row._id, row.amount]));
          return {};
        })
      );
    }

    const results = await Promise.all(promises);
    results.forEach(result => {
      Object.assign(overview, result);
    });

    overview.totalPatients = overview.totalPatients || 0;
    overview.totalDoctors = overview.totalDoctors || 0;
    overview.todayAppointments = overview.todayAppointments || 0;
    overview.periodAppointments = overview.periodAppointments || 0;
    overview.periodVisits = overview.periodVisits || 0;
    overview.periodRevenue = parseFloat((overview.periodRevenue || 0).toFixed(2));
    overview.periodBilled = parseFloat((overview.periodBilled || 0).toFixed(2));
    overview.totalOutstanding = parseFloat((overview.totalOutstanding || 0).toFixed(2));
    overview.outstandingInvoiceCount = overview.outstandingInvoiceCount || 0;

    const patientPopulateOptions = {
      path: 'patient',
      select: 'firstName lastName',
      match: patientTenantFilter(tenantId),
    };

    if (canViewAppointments) {
      const doctorPopulateOptions = {
        path: 'doctor',
        select: 'firstName lastName',
        match: buildTenantFilter(tenantId),
      };

      const recentAppointments = await Appointment.find({
        ...tenantFilter,
        appointmentDate: { $gte: todayStart, $lte: todayEnd },
      })
        .populate(patientPopulateOptions)
        .populate(doctorPopulateOptions)
        .sort({ appointmentTime: 1 })
        .limit(10)
        .lean();

      const nextWeek = dayRangeOffsetInTz(7, now, tz).end;
      const upcomingAppointments = await Appointment.find({
        ...tenantFilter,
        appointmentDate: { $gt: todayEnd, $lte: nextWeek },
        status: { $in: ['scheduled', 'confirmed'] },
      })
        .populate(patientPopulateOptions)
        .populate(doctorPopulateOptions)
        .sort({ appointmentDate: 1, appointmentTime: 1 })
        .limit(10)
        .lean();

      data.recentAppointments = recentAppointments.map((apt: any) => ({
        _id: apt._id,
        appointmentCode: apt.appointmentCode,
        patient: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown',
        doctor: apt.doctor ? `Dr. ${apt.doctor.firstName} ${apt.doctor.lastName}` : 'TBD',
        date: apt.appointmentDate,
        time: apt.appointmentTime,
        status: apt.status,
      }));

      data.upcomingAppointments = upcomingAppointments.map((apt: any) => ({
        _id: apt._id,
        appointmentCode: apt.appointmentCode,
        patient: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown',
        doctor: apt.doctor ? `Dr. ${apt.doctor.firstName} ${apt.doctor.lastName}` : 'TBD',
        date: apt.appointmentDate,
        time: apt.appointmentTime,
        status: apt.status,
      }));
    } else {
      data.recentAppointments = [];
      data.upcomingAppointments = [];
    }

    data.paymentMethodBreakdown = paymentMethodBreakdown;

    if (session.role === 'doctor') {
      const user = await User.findOne(buildTenantFilter(tenantId, { _id: session.userId }))
        .select('doctorProfile')
        .lean();
      const doctorProfileId = (user as any)?.doctorProfile;

      if (doctorProfileId) {
        const myAppointments = await Appointment.find({
          ...tenantFilter,
          $or: [{ doctor: doctorProfileId }, { provider: session.userId }],
          appointmentDate: { $gte: todayStart, $lte: todayEnd },
        })
          .populate(patientPopulateOptions)
          .sort({ appointmentTime: 1 })
          .limit(5)
          .lean();

        const myVisits = await Visit.find({
          ...tenantFilter,
          provider: session.userId,
          date: { $gte: dateRange.start, $lte: dateRange.end },
        })
          .populate(patientPopulateOptions)
          .sort({ date: -1 })
          .limit(5)
          .lean();

        data.myAppointments = myAppointments.map((apt: any) => ({
          _id: apt._id,
          appointmentCode: apt.appointmentCode,
          patient: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown',
          date: apt.appointmentDate,
          time: apt.appointmentTime,
          status: apt.status,
        }));

        data.myVisits = myVisits.map((visit: any) => ({
          _id: visit._id,
          patient: visit.patient ? `${visit.patient.firstName} ${visit.patient.lastName}` : 'Unknown',
          date: visit.date,
          diagnosis: visit.diagnosis || 'N/A',
        }));
      } else {
        console.warn(`Doctor user ${session.userId} is missing doctorProfile reference. Dashboard will not show personal appointments/visits.`);
        data.myAppointments = [];
        data.myVisits = [];
      }
    }

    if (session.role === 'accountant') {
      const rows = await Invoice.aggregate([
        { $match: periodInvoiceMatch },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalPaid: { $sum: { $ifNull: ['$totalPaid', 0] } },
            outstanding: { $sum: { $ifNull: ['$outstandingBalance', 0] } },
          },
        },
      ]);
      const byStatus = (status: string) => rows.find((r: any) => r._id === status);

      data.financialSummary = {
        totalInvoices: rows.reduce((sum: number, r: any) => sum + r.count, 0),
        paidInvoices: byStatus('paid')?.count || 0,
        unpaidInvoices: byStatus('unpaid')?.count || 0,
        partialInvoices: byStatus('partial')?.count || 0,
        totalPaid: byStatus('paid')?.totalPaid || 0,
        totalUnpaid: byStatus('unpaid')?.outstanding || 0,
      };
    }

    data.generatedAt = new Date().toISOString();

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error generating role-based dashboard data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate dashboard data' },
      { status: 500 }
    );
  }
}
