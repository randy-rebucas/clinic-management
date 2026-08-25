import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listDoctorsFull, listDoctorAppointments, listDoctorVisits, listDoctorPrescriptions } from '@/lib/data/doctor';
import { listInvoicesForVisits } from '@/lib/data/invoice';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin and accountants can view all doctor productivity
  if (session.role !== 'admin' && session.role !== 'accountant') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const data = await run(tenantId, async () => {
      const doctors = await listDoctorsFull({ status: 'active' });

      const dateRange: { startDate?: Date; endDate?: Date } = {};
      if (startDate) dateRange.startDate = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateRange.endDate = end;
      }

      const productivityReports = await Promise.all(
        doctors.map(async (doctor) => {
          try {
            const [appointments, visits, prescriptions] = await Promise.all([
              listDoctorAppointments(doctor.id, dateRange),
              listDoctorVisits(doctor.id, dateRange),
              listDoctorPrescriptions(doctor.id, dateRange),
            ]);

            const totalAppointments = appointments.length;
            const completedAppointments = appointments.filter((a) => a.status === 'completed').length;

            let totalRevenue = 0;
            if (visits.length > 0) {
              let invoices = await listInvoicesForVisits(visits.map((v) => v.id));
              if (startDate || endDate) {
                invoices = invoices.filter((inv: any) => {
                  const created = inv.createdAt;
                  if (startDate && created < new Date(startDate)) return false;
                  if (endDate && created > new Date(endDate + 'T23:59:59.999Z')) return false;
                  return true;
                });
              }
              totalRevenue = invoices.reduce((sum: number, inv: any) => sum + (inv.totalPaid || 0), 0);
            }

            return {
              doctor: {
                _id: doctor.id,
                name: `${doctor.firstName} ${doctor.lastName}`,
                specialization: doctor.specialization?.name,
              },
              summary: {
                totalAppointments,
                completedAppointments,
                totalVisits: visits.length,
                totalPrescriptions: prescriptions.length,
                totalRevenue,
              },
              metrics: {
                completionRate: totalAppointments > 0
                  ? ((completedAppointments / totalAppointments) * 100).toFixed(2)
                  : 0,
              },
            };
          } catch (error) {
            console.error(`Error calculating productivity for doctor ${doctor.id}:`, error);
            return {
              doctor: {
                _id: doctor.id,
                name: `${doctor.firstName} ${doctor.lastName}`,
                specialization: doctor.specialization?.name || 'Unknown',
              },
              error: 'Failed to calculate productivity',
            };
          }
        })
      );

      return {
        period: startDate && endDate ? { startDate, endDate } : { allTime: true },
        reports: productivityReports,
        generatedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Error generating productivity reports:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate productivity reports' },
      { status: 500 }
    );
  }
}
