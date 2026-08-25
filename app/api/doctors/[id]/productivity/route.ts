import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getDoctorByIdFull, listDoctorAppointments, listDoctorVisits, listDoctorPrescriptions } from '@/lib/data/doctor';
import { listInvoicesForVisits } from '@/lib/data/invoice';

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
      const visits = await listDoctorVisits(id, dateRange);
      const prescriptions = await listDoctorPrescriptions(id, dateRange);

      const totalAppointments = appointments.length;
      const completedAppointments = appointments.filter((a) => a.status === 'completed').length;
      const cancelledAppointments = appointments.filter((a) => a.status === 'cancelled').length;
      const noShowAppointments = appointments.filter((a) => a.status === 'no_show').length;
      const scheduledAppointments = appointments.filter((a) => a.status === 'scheduled' || a.status === 'confirmed').length;

      const totalVisits = visits.length;
      const completedVisits = visits.filter((v) => v.status === 'closed').length;
      const openVisits = visits.filter((v) => v.status === 'open').length;

      const totalPrescriptions = prescriptions.length;
      const activePrescriptions = prescriptions.filter((p) => p.status === 'active').length;
      const dispensedPrescriptions = prescriptions.filter((p) => p.status === 'dispensed').length;

      const invoices = startDate || endDate
        ? (await listInvoicesForVisits(visits.map((v) => v.id))).filter((inv) => {
            const created = inv.createdAt;
            if (startDate && created < new Date(startDate)) return false;
            if (endDate && created > new Date(endDate + 'T23:59:59.999Z')) return false;
            return true;
          })
        : await listInvoicesForVisits(visits.map((v) => v.id));

      const totalRevenue = invoices.reduce((sum: number, inv: any) => sum + (inv.totalPaid || 0), 0);
      const totalBilled = invoices.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0);
      const outstandingRevenue = invoices.reduce((sum: number, inv: any) => sum + (inv.outstandingBalance || 0), 0);

      const daysDiff = startDate && endDate
        ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
        : 30;
      const avgAppointmentsPerDay = daysDiff > 0 ? (totalAppointments / daysDiff).toFixed(2) : 0;

      const completionRate = totalAppointments > 0 ? ((completedAppointments / totalAppointments) * 100).toFixed(2) : 0;
      const noShowRate = totalAppointments > 0 ? ((noShowAppointments / totalAppointments) * 100).toFixed(2) : 0;

      const appointmentStatusBreakdown = {
        scheduled: appointments.filter((a) => a.status === 'scheduled').length,
        confirmed: appointments.filter((a) => a.status === 'confirmed').length,
        completed: completedAppointments,
        cancelled: cancelledAppointments,
        noShow: noShowAppointments,
      };

      const visitTypeBreakdown = visits.reduce((acc: any, visit: any) => {
        const type = visit.visitType || 'consultation';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      const prescriptionStatusBreakdown = prescriptions.reduce((acc: any, pres: any) => {
        const status = pres.status || 'active';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

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

      return {
        doctor: {
          _id: doctor.id,
          name: `${doctor.firstName} ${doctor.lastName}`,
          specialization: doctor.specialization?.name || 'Unknown',
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
    });

    if ('notFound' in result) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error generating productivity report:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate productivity report' },
      { status: 500 }
    );
  }
}
