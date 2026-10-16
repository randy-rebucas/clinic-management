import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { getSettings } from '@/lib/settings';
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
import { dayRangeInTz, dayRangeOffsetInTz, formatInTz } from '@/lib/tz';
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

    let doctorProfileId: Types.ObjectId | null = null;
    if (session.role === 'doctor') {
      const user = await User.findOne(buildTenantFilter(tenantId, { _id: session.userId }))
        .select('doctorProfile')
        .lean();
      doctorProfileId = (user as any)?.doctorProfile ?? null;
    }

    if (session.role === 'doctor') {
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

    // ---------------------------------------------------------------------
    // Chart data: daily trend, today's schedule board, appointment status mix
    // ---------------------------------------------------------------------
    const isDoctor = session.role === 'doctor';
    // A doctor's charts are their own work; everyone else sees the clinic.
    const apptScope: Record<string, unknown> = isDoctor
      ? doctorProfileId
        ? { $or: [{ doctor: doctorProfileId }, { provider: new Types.ObjectId(session.userId) }] }
        : { _id: null }
      : {};
    const visitScope: Record<string, unknown> = isDoctor ? { provider: new Types.ObjectId(session.userId) } : {};

    // "Today" charts look back 14 days so there is a shape to read; week/month show the whole period.
    const trendWindow = period === 'today'
      ? { start: dayRangeOffsetInTz(-13, now, tz).start, end: todayEnd }
      : dateRange;
    const dayKeys: string[] = [];
    for (let t = trendWindow.start.getTime() + 12 * 3600_000; t <= trendWindow.end.getTime(); t += 24 * 3600_000) {
      const key = formatInTz(new Date(t), 'yyyy-MM-dd', tz);
      if (dayKeys[dayKeys.length - 1] !== key) dayKeys.push(key);
    }
    const byDay = (field: string) => ({ $dateToString: { format: '%Y-%m-%d', date: field, timezone: tz } });
    const toMap = (rows: { _id: string; v: number }[]) => new Map(rows.map((r) => [r._id, r.v]));

    const [apptRows, visitRows, collectedRows, billedRows, statusRows] = await Promise.all([
      canViewAppointments
        ? Appointment.aggregate([
            { $match: { ...tenantFilter, ...apptScope, appointmentDate: { $gte: trendWindow.start, $lte: trendWindow.end }, status: { $ne: 'cancelled' } } },
            { $group: { _id: byDay('$appointmentDate'), v: { $sum: 1 } } },
          ])
        : [],
      canViewVisits
        ? Visit.aggregate([
            { $match: { ...tenantFilter, ...visitScope, date: { $gte: trendWindow.start, $lte: trendWindow.end }, status: { $ne: 'cancelled' } } },
            { $group: { _id: byDay('$date'), v: { $sum: 1 } } },
          ])
        : [],
      canViewInvoices && !isDoctor
        ? Invoice.aggregate([
            { $match: { ...tenantFilter, 'payments.date': { $gte: trendWindow.start, $lte: trendWindow.end } } },
            { $unwind: '$payments' },
            { $match: { 'payments.date': { $gte: trendWindow.start, $lte: trendWindow.end } } },
            { $group: { _id: byDay('$payments.date'), v: { $sum: { $ifNull: ['$payments.amount', 0] } } } },
          ])
        : [],
      canViewInvoices && !isDoctor
        ? Invoice.aggregate([
            { $match: { ...tenantFilter, createdAt: { $gte: trendWindow.start, $lte: trendWindow.end } } },
            { $group: { _id: byDay('$createdAt'), v: { $sum: { $ifNull: ['$total', 0] } } } },
          ])
        : [],
      canViewAppointments
        ? Appointment.aggregate([
            { $match: { ...tenantFilter, ...apptScope, appointmentDate: { $gte: dateRange.start, $lte: dateRange.end } } },
            { $group: { _id: '$status', v: { $sum: 1 } } },
          ])
        : [],
    ]);

    const appts = toMap(apptRows);
    const visits = toMap(visitRows);
    const collected = toMap(collectedRows);
    const billed = toMap(billedRows);
    const todayKey = formatInTz(now, 'yyyy-MM-dd', tz);
    data.trend = {
      today: todayKey,
      days: dayKeys.map((date) => ({
        date,
        appointments: appts.get(date) || 0,
        visits: visits.get(date) || 0,
        collected: Math.round((collected.get(date) || 0) * 100) / 100,
        billed: Math.round((billed.get(date) || 0) * 100) / 100,
      })),
    };
    data.statusMix = Object.fromEntries(statusRows.map((r: { _id: string; v: number }) => [r._id || 'unknown', r.v]));

    if (canViewAppointments) {
      const settings = await getSettings(tenantId).catch(() => null);
      const weekday = formatInTz(now, 'EEEE', tz).toLowerCase();
      const hours = (settings as any)?.businessHours?.find((h: any) => h.day === weekday);
      const defaultDuration = (settings as any)?.appointmentSettings?.defaultDuration || 30;

      const schedule = await Appointment.find({
        ...tenantFilter,
        ...apptScope,
        appointmentDate: { $gte: todayStart, $lte: todayEnd },
      })
        .select('appointmentTime duration status patient doctor')
        .populate(patientPopulateOptions)
        .populate({ path: 'doctor', select: 'firstName lastName', match: buildTenantFilter(tenantId) })
        .sort({ appointmentTime: 1 })
        .limit(200)
        .lean();

      data.todaySchedule = {
        open: hours && !hours.closed ? hours.open : null,
        close: hours && !hours.closed ? hours.close : null,
        closedToday: Boolean(hours?.closed),
        now: formatInTz(now, 'HH:mm', tz),
        appointments: schedule.map((apt: any) => ({
          _id: apt._id,
          time: apt.appointmentTime,
          duration: apt.duration || defaultDuration,
          status: apt.status,
          patient: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown',
          doctorId: apt.doctor?._id ? String(apt.doctor._id) : null,
          doctor: apt.doctor ? `Dr. ${apt.doctor.firstName} ${apt.doctor.lastName}` : 'Unassigned',
        })),
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
