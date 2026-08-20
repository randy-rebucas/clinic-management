// Staff Performance Reports Automation
// Tracks and reports staff performance metrics

import prisma from '@/lib/prisma';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getAutomationSettings, getOrCreateSettings } from '@/lib/data/settings';
import { listActiveUsersByRoleNames } from '@/lib/data/user';
import { sendEmail } from '@/lib/email';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export interface StaffPerformanceReportOptions {
  period: 'weekly' | 'monthly';
  tenantId?: string;
  sendEmail?: boolean;
  recipients?: string[];
  doctorId?: string; // Optional: specific doctor
}

/**
 * Generate staff performance report
 */
export async function generateStaffPerformanceReport(
  options: StaffPerformanceReportOptions
): Promise<{
  success: boolean;
  report?: any;
  error?: string;
}> {
  try {
    const tenantId = options.tenantId ?? null;

    const automationSettings = await run(tenantId, () => getAutomationSettings(tenantId));
    if (!automationSettings.autoStaffPerformanceReports) {
      return { success: true };
    }

    const { period } = options;
    const now = new Date();

    let startDate: Date;
    const endDate: Date = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    if (period === 'weekly') {
      startDate = new Date(now);
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startDate.setDate(diff);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
    }

    const report = await run(tenantId, async () => {
      const doctorWhere: any = { status: 'active' };
      if (options.doctorId) doctorWhere.id = options.doctorId;

      const doctors = await prisma.doctor.findMany({ where: doctorWhere });

      const performanceData: any[] = [];

      for (const doctor of doctors) {
        const appointments = await prisma.appointment.findMany({
          where: {
            OR: [{ doctorId: doctor.id }, { providerId: doctor.id }],
            appointmentDate: { gte: startDate, lte: endDate },
          },
        });

        const totalAppointments = appointments.length;
        const completedAppointments = appointments.filter((a) => a.status === 'completed').length;
        const cancelledAppointments = appointments.filter((a) => a.status === 'cancelled').length;
        const noShowAppointments = appointments.filter((a) => a.status === 'no_show').length;

        const visits = await prisma.visit.findMany({
          where: {
            providerId: doctor.id,
            date: { gte: startDate, lte: endDate },
          },
        });

        const completedVisits = visits.filter((v) => v.status === 'closed').length;

        const visitIds = visits.map((v) => v.id);
        const invoices = visitIds.length
          ? await prisma.invoice.findMany({ where: { visitId: { in: visitIds } } })
          : [];

        const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.totalPaid || 0), 0);
        const totalBilled = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

        const prescriptions = await prisma.prescription.findMany({
          where: { prescribedById: doctor.id, issuedAt: { gte: startDate, lte: endDate } },
        });

        const completionRate = totalAppointments > 0
          ? ((completedAppointments / totalAppointments) * 100).toFixed(1)
          : '0';

        const noShowRate = totalAppointments > 0
          ? ((noShowAppointments / totalAppointments) * 100).toFixed(1)
          : '0';

        const cancellationRate = totalAppointments > 0
          ? ((cancelledAppointments / totalAppointments) * 100).toFixed(1)
          : '0';

        const avgRevenuePerVisit = completedVisits > 0
          ? (totalRevenue / completedVisits).toFixed(2)
          : '0';

        performanceData.push({
          doctorId: doctor.id,
          doctorName: `${doctor.firstName} ${doctor.lastName}`,
          specialization: (doctor as any).specialization || 'General',
          metrics: {
            appointments: {
              total: totalAppointments,
              completed: completedAppointments,
              cancelled: cancelledAppointments,
              noShow: noShowAppointments,
              completionRate: `${completionRate}%`,
              noShowRate: `${noShowRate}%`,
              cancellationRate: `${cancellationRate}%`,
            },
            visits: {
              total: visits.length,
              completed: completedVisits,
            },
            revenue: {
              totalBilled,
              totalPaid: totalRevenue,
              avgPerVisit: parseFloat(avgRevenuePerVisit),
            },
            prescriptions: {
              total: prescriptions.length,
            },
          },
        });
      }

      // Sort by revenue (descending)
      performanceData.sort((a, b) => b.metrics.revenue.totalPaid - a.metrics.revenue.totalPaid);

      return {
        period,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        staffPerformance: performanceData,
        summary: {
          totalDoctors: performanceData.length,
          totalAppointments: performanceData.reduce((sum, d) => sum + d.metrics.appointments.total, 0),
          totalRevenue: performanceData.reduce((sum, d) => sum + d.metrics.revenue.totalPaid, 0),
          avgCompletionRate: performanceData.length > 0
            ? (performanceData.reduce((sum, d) =>
                sum + parseFloat(d.metrics.appointments.completionRate), 0) / performanceData.length).toFixed(1)
            : '0',
        },
        generatedAt: new Date().toISOString(),
      };
    });

    // Send email if enabled
    if (options.sendEmail !== false) {
      const recipients = options.recipients || (await run(tenantId, () => getReportRecipients()));
      const settings = await run(tenantId, () => getOrCreateSettings(tenantId));

      for (const recipient of recipients) {
        try {
          const emailContent = generateStaffPerformanceEmail(report, period, settings);
          await sendEmail({
            to: recipient,
            subject: emailContent.subject,
            html: emailContent.html,
          });
        } catch (error) {
          console.error(`Error sending staff performance report to ${recipient}:`, error);
        }
      }
    }

    return { success: true, report };
  } catch (error: any) {
    console.error('Error generating staff performance report:', error);
    return {
      success: false,
      error: error.message || 'Failed to generate staff performance report',
    };
  }
}

/**
 * Get report recipients (admins only)
 */
async function getReportRecipients(): Promise<string[]> {
  try {
    const users = await listActiveUsersByRoleNames(['admin']);
    return users.map((u) => u.email).filter(Boolean);
  } catch (error) {
    console.error('Error getting report recipients:', error);
    return [];
  }
}

/**
 * Generate staff performance email
 */
function generateStaffPerformanceEmail(
  report: any,
  period: 'weekly' | 'monthly',
  settings: any
): { subject: string; html: string } {
  const clinicName = settings.clinicName || 'Clinic';
  const periodLabel = period === 'weekly' ? 'Weekly' : 'Monthly';
  const subject = `${periodLabel} Staff Performance Report - ${clinicName}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 900px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .section { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #4CAF50; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #4CAF50; color: white; }
        .metric { display: inline-block; margin: 5px; padding: 5px 10px; background-color: #f0f0f0; border-radius: 4px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${periodLabel} Staff Performance Report</h1>
          <p>${clinicName}</p>
          <p>${new Date(report.dateRange.start).toLocaleDateString()} - ${new Date(report.dateRange.end).toLocaleDateString()}</p>
        </div>
        <div class="content">
          <div class="section">
            <h2>Summary</h2>
            <div class="metric">Total Doctors: ${report.summary.totalDoctors}</div>
            <div class="metric">Total Appointments: ${report.summary.totalAppointments}</div>
            <div class="metric">Total Revenue: ₱${report.summary.totalRevenue.toLocaleString()}</div>
            <div class="metric">Avg Completion Rate: ${report.summary.avgCompletionRate}%</div>
          </div>

          <div class="section">
            <h2>Individual Performance</h2>
            <table>
              <tr>
                <th>Doctor</th>
                <th>Specialization</th>
                <th>Appointments</th>
                <th>Completed</th>
                <th>Completion Rate</th>
                <th>No-Show Rate</th>
                <th>Revenue</th>
                <th>Avg/Visit</th>
                <th>Prescriptions</th>
              </tr>
              ${report.staffPerformance.map((staff: any) => `
                <tr>
                  <td>${staff.doctorName}</td>
                  <td>${staff.specialization}</td>
                  <td>${staff.metrics.appointments.total}</td>
                  <td>${staff.metrics.appointments.completed}</td>
                  <td>${staff.metrics.appointments.completionRate}</td>
                  <td>${staff.metrics.appointments.noShowRate}</td>
                  <td>₱${staff.metrics.revenue.totalPaid.toLocaleString()}</td>
                  <td>₱${staff.metrics.revenue.avgPerVisit.toLocaleString()}</td>
                  <td>${staff.metrics.prescriptions.total}</td>
                </tr>
              `).join('')}
            </table>
          </div>
        </div>
        <div class="footer">
          <p>Report generated on ${new Date(report.generatedAt).toLocaleString()}</p>
          <p>This is an automated report. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}

/**
 * Process weekly staff performance reports
 */
export async function processWeeklyStaffPerformance(tenantId?: string): Promise<{
  success: boolean;
  processed: boolean;
  error?: string;
}> {
  try {
    const result = await generateStaffPerformanceReport({
      period: 'weekly',
      tenantId,
      sendEmail: true,
    });

    return {
      success: result.success,
      processed: !!result.report,
      error: result.error,
    };
  } catch (error: any) {
    console.error('Error processing weekly staff performance:', error);
    return {
      success: false,
      processed: false,
      error: error.message,
    };
  }
}

/**
 * Process monthly staff performance reports
 */
export async function processMonthlyStaffPerformance(tenantId?: string): Promise<{
  success: boolean;
  processed: boolean;
  error?: string;
}> {
  try {
    const result = await generateStaffPerformanceReport({
      period: 'monthly',
      tenantId,
      sendEmail: true,
    });

    return {
      success: result.success,
      processed: !!result.report,
      error: result.error,
    };
  } catch (error: any) {
    console.error('Error processing monthly staff performance:', error);
    return {
      success: false,
      processed: false,
      error: error.message,
    };
  }
}
