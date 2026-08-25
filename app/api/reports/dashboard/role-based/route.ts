import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, hasPermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { countPatients } from '@/lib/data/patient';
import { countActiveDoctors } from '@/lib/data/doctor';
import { countAppointmentsInRange, listAppointments } from '@/lib/data/appointment';
import { countVisitsByDateInRange, listVisits } from '@/lib/data/visit';
import { listInvoicesCreatedInRange, listOutstandingInvoicesRaw } from '@/lib/data/invoice';
import { getUserById } from '@/lib/data/user';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>): Promise<T> {
  return Promise.resolve(tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn));
}

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'today'; // today, week, month

    // Calculate date range
    const now = new Date();
    let dateRange: { start: Date; end: Date };

    switch (period) {
      case 'week':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        dateRange = { start: weekStart, end: weekEnd };
        break;
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        monthStart.setHours(0, 0, 0, 0);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        dateRange = { start: monthStart, end: monthEnd };
        break;
      case 'today':
      default:
        dateRange = {
          start: new Date(now.setHours(0, 0, 0, 0)),
          end: new Date(now.setHours(23, 59, 59, 999)),
        };
        break;
    }

    // Get today's date for today-specific queries
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Check permissions for each resource
    const canViewPatients = await hasPermission(session, 'patients', 'read');
    const canViewAppointments = await hasPermission(session, 'appointments', 'read');
    const canViewVisits = await hasPermission(session, 'visits', 'read');
    const canViewInvoices = await hasPermission(session, 'invoices', 'read');
    const canViewDoctors = await hasPermission(session, 'doctors', 'read');
    const canViewPrescriptions = await hasPermission(session, 'prescriptions', 'read');
    const canViewLabResults = await hasPermission(session, 'lab-results', 'read');
    const canViewReports = await hasPermission(session, 'reports', 'read');

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

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Fetch data based on permissions (tenant-scoped)
    const promises: Promise<any>[] = [];

    if (canViewPatients) {
      promises.push(run(tenantId, () => countPatients()).then((count) => ({ totalPatients: count })));
    }

    if (canViewDoctors) {
      promises.push(run(tenantId, () => countActiveDoctors()).then((count) => ({ totalDoctors: count })));
    }

    if (canViewAppointments) {
      promises.push(
        run(tenantId, () =>
          countAppointmentsInRange({ start: todayStart, end: todayEnd }, { status: { in: ['scheduled', 'confirmed'] } })
        ).then((count) => ({ todayAppointments: count })),
        run(tenantId, () => countAppointmentsInRange({ start: dateRange.start, end: dateRange.end })).then((count) => ({
          periodAppointments: count,
        }))
      );
    }

    if (canViewVisits) {
      promises.push(
        run(tenantId, () => countVisitsByDateInRange({ start: dateRange.start, end: dateRange.end })).then((count) => ({
          periodVisits: count,
        }))
      );
    }

    if (canViewInvoices) {
      promises.push(
        run(tenantId, () => listInvoicesCreatedInRange({ start: dateRange.start, end: dateRange.end })).then((invoices) => {
          const periodRevenue = invoices.reduce((sum: number, inv: any) => sum + (inv.totalPaid || 0), 0);
          const periodBilled = invoices.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0);
          return { periodInvoices: invoices, periodRevenue, periodBilled };
        }),
        run(tenantId, () => listOutstandingInvoicesRaw()).then((invoices) => {
          const totalOutstanding = invoices.reduce((sum: number, inv: any) => sum + (inv.outstandingBalance || 0), 0);
          return { outstandingInvoices: invoices, totalOutstanding, outstandingInvoiceCount: invoices.length };
        })
      );
    }

    // Wait for all promises
    const results = await Promise.all(promises);

    // Merge results into overview
    results.forEach((result) => {
      Object.assign(overview, result);
    });

    // Set defaults for missing values
    overview.totalPatients = overview.totalPatients || 0;
    overview.totalDoctors = overview.totalDoctors || 0;
    overview.todayAppointments = overview.todayAppointments || 0;
    overview.periodAppointments = overview.periodAppointments || 0;
    overview.periodVisits = overview.periodVisits || 0;
    overview.periodRevenue = parseFloat((overview.periodRevenue || 0).toFixed(2));
    overview.periodBilled = parseFloat((overview.periodBilled || 0).toFixed(2));
    overview.totalOutstanding = parseFloat((overview.totalOutstanding || 0).toFixed(2));
    overview.outstandingInvoiceCount = overview.outstandingInvoiceCount || 0;

    // Fetch appointments if permitted (tenant-scoped)
    if (canViewAppointments) {
      const nextWeek = new Date(now);
      nextWeek.setDate(now.getDate() + 7);

      const [recentAppointments, upcomingAppointments] = await run(tenantId, () =>
        Promise.all([
          listAppointments({ appointmentDate: { gte: todayStart, lte: todayEnd } }),
          listAppointments({
            appointmentDate: { gte: todayEnd, lte: nextWeek },
            status: { in: ['scheduled', 'confirmed'] },
          }),
        ])
      );

      data.recentAppointments = recentAppointments.slice(0, 10).map((apt: any) => ({
        _id: apt._id,
        appointmentCode: apt.appointmentCode,
        patient: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown',
        doctor: apt.doctor ? `Dr. ${apt.doctor.firstName} ${apt.doctor.lastName}` : 'TBD',
        date: apt.appointmentDate,
        time: apt.appointmentTime,
        status: apt.status,
      }));

      data.upcomingAppointments = upcomingAppointments.slice(0, 10).map((apt: any) => ({
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

    // Payment method breakdown for period (if invoices accessible)
    if (canViewInvoices && overview.periodInvoices) {
      const paymentMethodBreakdown: Record<string, number> = {};
      overview.periodInvoices.forEach((inv: any) => {
        inv.payments?.forEach((payment: any) => {
          const method = payment.method || 'unknown';
          paymentMethodBreakdown[method] = (paymentMethodBreakdown[method] || 0) + (payment.amount || 0);
        });
      });
      data.paymentMethodBreakdown = paymentMethodBreakdown;
    } else {
      data.paymentMethodBreakdown = {};
    }

    // Role-specific data (tenant-scoped)
    if (session.role === 'doctor') {
      // Doctor-specific: My appointments, my visits
      const user = await run(tenantId, () => getUserById(session.userId as string));
      const staffId = (user as any)?.doctorProfile?.id;

      if (staffId) {
        const [myAppointments, myVisits] = await run(tenantId, () =>
          Promise.all([
            listAppointments({
              doctorId: staffId,
              appointmentDate: { gte: todayStart, lte: todayEnd },
            }),
            listVisits({
              providerId: staffId,
              date: { gte: dateRange.start, lte: dateRange.end },
            }),
          ])
        );

        data.myAppointments = myAppointments.slice(0, 5).map((apt: any) => ({
          _id: apt._id,
          appointmentCode: apt.appointmentCode,
          patient: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown',
          date: apt.appointmentDate,
          time: apt.appointmentTime,
          status: apt.status,
        }));

        data.myVisits = myVisits.slice(0, 5).map((visit: any) => ({
          _id: visit._id,
          patient: visit.patient ? `${visit.patient.firstName} ${visit.patient.lastName}` : 'Unknown',
          date: visit.date,
          diagnosis: visit.diagnosis || 'N/A',
        }));
      } else {
        // Fallback: log missing staff reference and prevent crash
        console.warn(`Doctor user ${session.userId} is missing staff reference. Dashboard will not show personal appointments/visits.`);
        data.myAppointments = [];
        data.myVisits = [];
      }
    }

    if (session.role === 'accountant') {
      // Accountant-specific: Financial summary (tenant-scoped)
      const allInvoices = await run(tenantId, () =>
        listInvoicesCreatedInRange({ start: dateRange.start, end: dateRange.end })
      );

      const paidInvoices = allInvoices.filter((inv: any) => inv.status === 'paid');
      const unpaidInvoices = allInvoices.filter((inv: any) => inv.status === 'unpaid');
      const partialInvoices = allInvoices.filter((inv: any) => inv.status === 'partial');

      data.financialSummary = {
        totalInvoices: allInvoices.length,
        paidInvoices: paidInvoices.length,
        unpaidInvoices: unpaidInvoices.length,
        partialInvoices: partialInvoices.length,
        totalPaid: paidInvoices.reduce((sum: number, inv: any) => sum + (inv.totalPaid || 0), 0),
        totalUnpaid: unpaidInvoices.reduce((sum: number, inv: any) => sum + (inv.outstandingBalance || 0), 0),
      };
    }

    data.generatedAt = new Date().toISOString();

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    // Improved error logging and reporting
    console.error('Error generating role-based dashboard data:', error);
    let errorMessage = 'Failed to generate dashboard data';
    if (error && error.message) {
      errorMessage += `: ${error.message}`;
    }
    return NextResponse.json(
      { success: false, error: errorMessage, details: error?.stack || error },
      { status: 500 }
    );
  }
}
