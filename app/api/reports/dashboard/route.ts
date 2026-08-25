import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { countPatients } from '@/lib/data/patient';
import { countActiveDoctors } from '@/lib/data/doctor';
import { countAppointmentsInRange, listAppointments } from '@/lib/data/appointment';
import { countVisitsByDateInRange } from '@/lib/data/visit';
import { listInvoicesCreatedInRange, listOutstandingInvoicesRaw } from '@/lib/data/invoice';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read reports
  const permissionCheck = await requirePermission(session, 'reports', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

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

    // Fetch all data in parallel, scoped to the active tenant
    const [
      totalPatients,
      totalDoctors,
      todayAppointments,
      periodAppointments,
      periodVisits,
      periodInvoices,
      outstandingInvoices,
    ] = await run(tenantId, () =>
      Promise.all([
        countPatients(),
        countActiveDoctors(),
        countAppointmentsInRange({ start: todayStart, end: todayEnd }, { status: { in: ['scheduled', 'confirmed'] } }),
        countAppointmentsInRange({ start: dateRange.start, end: dateRange.end }),
        countVisitsByDateInRange({ start: dateRange.start, end: dateRange.end }),
        listInvoicesCreatedInRange({ start: dateRange.start, end: dateRange.end }),
        listOutstandingInvoicesRaw(),
      ])
    );

    // Calculate revenue metrics
    const periodRevenue = periodInvoices.reduce((sum: number, inv: any) => sum + (inv.totalPaid || 0), 0);
    const periodBilled = periodInvoices.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0);
    const totalOutstanding = outstandingInvoices.reduce((sum: number, inv: any) => sum + (inv.outstandingBalance || 0), 0);

    // Recent appointments (today) and upcoming appointments (next 7 days)
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);

    const [recentAppointmentsAll, upcomingAppointmentsAll] = await run(tenantId, () =>
      Promise.all([
        listAppointments({
          appointmentDate: { gte: todayStart, lte: todayEnd },
        }),
        listAppointments({
          appointmentDate: { gte: todayEnd, lte: nextWeek },
          status: { in: ['scheduled', 'confirmed'] },
        }),
      ])
    );

    const recentAppointments = recentAppointmentsAll.slice(0, 10);
    const upcomingAppointments = upcomingAppointmentsAll.slice(0, 10);

    // Payment method breakdown for period
    const paymentMethodBreakdown: Record<string, number> = {};
    periodInvoices.forEach((inv: any) => {
      inv.payments?.forEach((payment: any) => {
        const method = payment.method || 'unknown';
        paymentMethodBreakdown[method] = (paymentMethodBreakdown[method] || 0) + (payment.amount || 0);
      });
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
          outstandingInvoiceCount: outstandingInvoices.length,
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
