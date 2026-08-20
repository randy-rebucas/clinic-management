// Periodic Reports Automation (Weekly/Monthly)
// Generates and sends weekly and monthly analytics reports

import prisma from '@/lib/prisma';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getAutomationSettings } from '@/lib/data/settings';
import { listActiveUsersByRoleNames } from '@/lib/data/user';
import { sendEmail } from '@/lib/email';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export interface PeriodicReportOptions {
  period: 'weekly' | 'monthly';
  tenantId?: string;
  sendEmail?: boolean;
  recipients?: string[];
}

/**
 * Generate weekly or monthly analytics report
 */
export async function generatePeriodicReport(options: PeriodicReportOptions): Promise<{
  success: boolean;
  report?: any;
  error?: string;
}> {
  try {
    const tenantId = options.tenantId ?? null;

    const automationSettings = await run(tenantId, () => getAutomationSettings(tenantId));
    if (!automationSettings.autoPeriodicReports) {
      return { success: true };
    }

    const { period } = options;
    const now = new Date();

    // Calculate date range
    let startDate: Date;
    const endDate: Date = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    if (period === 'weekly') {
      startDate = new Date(now);
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust to Monday
      startDate.setDate(diff);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
    }

    const report = await run(tenantId, async () => {
      const [
        totalPatients,
        newPatients,
        totalAppointments,
        completedAppointments,
        cancelledAppointments,
        noShowAppointments,
        totalVisits,
        completedVisits,
        totalInvoices,
        invoices,
        totalPrescriptions,
        totalLabResults,
        doctors,
      ] = await Promise.all([
        prisma.patient.count(),
        prisma.patient.count({ where: { createdAt: { gte: startDate, lte: endDate } } }),
        prisma.appointment.count({ where: { appointmentDate: { gte: startDate, lte: endDate } } }),
        prisma.appointment.count({ where: { appointmentDate: { gte: startDate, lte: endDate }, status: 'completed' } }),
        prisma.appointment.count({ where: { appointmentDate: { gte: startDate, lte: endDate }, status: 'cancelled' } }),
        prisma.appointment.count({ where: { appointmentDate: { gte: startDate, lte: endDate }, status: 'no_show' } }),
        prisma.visit.count({ where: { date: { gte: startDate, lte: endDate } } }),
        prisma.visit.count({ where: { date: { gte: startDate, lte: endDate }, status: 'closed' } }),
        prisma.invoice.count({ where: { createdAt: { gte: startDate, lte: endDate } } }),
        prisma.invoice.findMany({ where: { createdAt: { gte: startDate, lte: endDate } }, include: { payments: true } }),
        prisma.prescription.count({ where: { issuedAt: { gte: startDate, lte: endDate } } }),
        prisma.labResult.count({ where: { createdAt: { gte: startDate, lte: endDate } } }),
        prisma.doctor.findMany({ where: { status: 'active' } }),
      ]);

      // Calculate revenue metrics
      const totalBilled = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
      const totalPaid = invoices.reduce((sum, inv) => sum + (inv.totalPaid || 0), 0);
      const totalDiscounts = invoices.reduce((sum, inv) => sum + 0, 0); // discounts child table not loaded here
      const totalTax = invoices.reduce((sum, inv) => sum + (inv.tax || 0), 0);

      // Outstanding balance (all unpaid invoices)
      const outstandingInvoices = await prisma.invoice.findMany({
        where: { status: { in: ['unpaid', 'partial'] } },
        select: { outstandingBalance: true },
      });
      const totalOutstanding = outstandingInvoices.reduce((sum, inv) => sum + (inv.outstandingBalance || 0), 0);

      // Revenue by payment method
      const revenueByMethod: Record<string, number> = {};
      for (const inv of invoices) {
        for (const payment of inv.payments) {
          const method = payment.method || 'unknown';
          revenueByMethod[method] = (revenueByMethod[method] || 0) + (payment.amount || 0);
        }
      }

      // Revenue by doctor (visits with a provider in range, matched to invoices for that visit)
      const revenueByDoctor: Record<string, number> = {};
      const visitsWithDoctors = await prisma.visit.findMany({
        where: { date: { gte: startDate, lte: endDate }, status: 'closed' },
        include: { provider: { select: { name: true } } },
      });
      for (const visit of visitsWithDoctors) {
        const doctorName = visit.provider?.name;
        if (doctorName) {
          const visitInvoices = invoices.filter((inv) => inv.visitId === visit.id);
          const visitRevenue = visitInvoices.reduce((sum, inv) => sum + (inv.totalPaid || 0), 0);
          revenueByDoctor[doctorName] = (revenueByDoctor[doctorName] || 0) + visitRevenue;
        }
      }

      // Appointment completion rate
      const completionRate = totalAppointments > 0
        ? ((completedAppointments / totalAppointments) * 100).toFixed(1)
        : '0';

      // No-show rate
      const noShowRate = totalAppointments > 0
        ? ((noShowAppointments / totalAppointments) * 100).toFixed(1)
        : '0';

      // Average revenue per visit
      const avgRevenuePerVisit = completedVisits > 0
        ? (totalPaid / completedVisits).toFixed(2)
        : '0';

      return {
        period,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        summary: {
          patients: {
            total: totalPatients,
            new: newPatients,
          },
          appointments: {
            total: totalAppointments,
            completed: completedAppointments,
            cancelled: cancelledAppointments,
            noShow: noShowAppointments,
            completionRate: `${completionRate}%`,
            noShowRate: `${noShowRate}%`,
          },
          visits: {
            total: totalVisits,
            completed: completedVisits,
          },
          revenue: {
            totalBilled,
            totalPaid,
            totalDiscounts,
            totalTax,
            outstandingBalance: totalOutstanding,
            avgRevenuePerVisit: parseFloat(avgRevenuePerVisit),
            byPaymentMethod: revenueByMethod,
            byDoctor: revenueByDoctor,
          },
          prescriptions: {
            total: totalPrescriptions,
          },
          labResults: {
            total: totalLabResults,
          },
          doctors: {
            active: doctors.length,
          },
        },
        generatedAt: new Date().toISOString(),
      };
    });

    // Send email if enabled
    if (options.sendEmail !== false) {
      const recipients = options.recipients || (await run(tenantId, () => getReportRecipients()));

      for (const recipient of recipients) {
        try {
          const settings = await run(tenantId, () => import('@/lib/data/settings').then((m) => m.getOrCreateSettings(tenantId)));
          const emailContent = generatePeriodicReportEmail(report, period, settings);
          await sendEmail({
            to: recipient,
            subject: emailContent.subject,
            html: emailContent.html,
          });
        } catch (error) {
          console.error(`Error sending periodic report to ${recipient}:`, error);
        }
      }
    }

    return { success: true, report };
  } catch (error: any) {
    console.error('Error generating periodic report:', error);
    return {
      success: false,
      error: error.message || 'Failed to generate periodic report',
    };
  }
}

/**
 * Get report recipients (admins and accountants)
 */
async function getReportRecipients(): Promise<string[]> {
  try {
    const users = await listActiveUsersByRoleNames(['admin', 'accountant']);
    return users.map((u) => u.email).filter(Boolean);
  } catch (error) {
    console.error('Error getting report recipients:', error);
    return [];
  }
}

/**
 * Generate periodic report email
 */
function generatePeriodicReportEmail(
  report: any,
  period: 'weekly' | 'monthly',
  settings: any
): { subject: string; html: string } {
  const clinicName = settings.clinicName || 'Clinic';
  const periodLabel = period === 'weekly' ? 'Weekly' : 'Monthly';
  const subject = `${periodLabel} Analytics Report - ${clinicName}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .section { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid #2196F3; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background-color: #f0f0f0; border-radius: 4px; }
        .metric-value { font-size: 1.5em; font-weight: bold; color: #2196F3; }
        .metric-label { font-size: 0.9em; color: #666; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #2196F3; color: white; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${periodLabel} Analytics Report</h1>
          <p>${clinicName}</p>
          <p>${new Date(report.dateRange.start).toLocaleDateString()} - ${new Date(report.dateRange.end).toLocaleDateString()}</p>
        </div>
        <div class="content">
          <div class="section">
            <h2>Patients</h2>
            <div class="metric">
              <div class="metric-value">${report.summary.patients.total}</div>
              <div class="metric-label">Total Patients</div>
            </div>
            <div class="metric">
              <div class="metric-value">${report.summary.patients.new}</div>
              <div class="metric-label">New This ${period === 'weekly' ? 'Week' : 'Month'}</div>
            </div>
          </div>

          <div class="section">
            <h2>Appointments</h2>
            <div class="metric">
              <div class="metric-value">${report.summary.appointments.total}</div>
              <div class="metric-label">Total</div>
            </div>
            <div class="metric">
              <div class="metric-value">${report.summary.appointments.completed}</div>
              <div class="metric-label">Completed</div>
            </div>
            <div class="metric">
              <div class="metric-value">${report.summary.appointments.completionRate}</div>
              <div class="metric-label">Completion Rate</div>
            </div>
            <div class="metric">
              <div class="metric-value">${report.summary.appointments.noShowRate}</div>
              <div class="metric-label">No-Show Rate</div>
            </div>
          </div>

          <div class="section">
            <h2>Revenue</h2>
            <div class="metric">
              <div class="metric-value">₱${report.summary.revenue.totalPaid.toLocaleString()}</div>
              <div class="metric-label">Total Revenue</div>
            </div>
            <div class="metric">
              <div class="metric-value">₱${report.summary.revenue.totalBilled.toLocaleString()}</div>
              <div class="metric-label">Total Billed</div>
            </div>
            <div class="metric">
              <div class="metric-value">₱${report.summary.revenue.outstandingBalance.toLocaleString()}</div>
              <div class="metric-label">Outstanding</div>
            </div>
            <div class="metric">
              <div class="metric-value">₱${report.summary.revenue.avgRevenuePerVisit.toLocaleString()}</div>
              <div class="metric-label">Avg per Visit</div>
            </div>

            ${Object.keys(report.summary.revenue.byPaymentMethod).length > 0 ? `
              <h3>Revenue by Payment Method</h3>
              <table>
                <tr><th>Method</th><th>Amount</th></tr>
                ${Object.entries(report.summary.revenue.byPaymentMethod).map(([method, amount]: [string, any]) => `
                  <tr><td>${method}</td><td>₱${amount.toLocaleString()}</td></tr>
                `).join('')}
              </table>
            ` : ''}

            ${Object.keys(report.summary.revenue.byDoctor).length > 0 ? `
              <h3>Revenue by Doctor</h3>
              <table>
                <tr><th>Doctor</th><th>Revenue</th></tr>
                ${Object.entries(report.summary.revenue.byDoctor).map(([doctor, revenue]: [string, any]) => `
                  <tr><td>${doctor}</td><td>₱${revenue.toLocaleString()}</td></tr>
                `).join('')}
              </table>
            ` : ''}
          </div>

          <div class="section">
            <h2>Other Metrics</h2>
            <div class="metric">
              <div class="metric-value">${report.summary.visits.completed}</div>
              <div class="metric-label">Completed Visits</div>
            </div>
            <div class="metric">
              <div class="metric-value">${report.summary.prescriptions.total}</div>
              <div class="metric-label">Prescriptions</div>
            </div>
            <div class="metric">
              <div class="metric-value">${report.summary.labResults.total}</div>
              <div class="metric-label">Lab Results</div>
            </div>
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
 * Process weekly reports
 */
export async function processWeeklyReports(tenantId?: string): Promise<{
  success: boolean;
  processed: boolean;
  error?: string;
}> {
  try {
    const result = await generatePeriodicReport({
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
    console.error('Error processing weekly reports:', error);
    return {
      success: false,
      processed: false,
      error: error.message,
    };
  }
}

/**
 * Process monthly reports
 */
export async function processMonthlyReports(tenantId?: string): Promise<{
  success: boolean;
  processed: boolean;
  error?: string;
}> {
  try {
    const result = await generatePeriodicReport({
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
    console.error('Error processing monthly reports:', error);
    return {
      success: false,
      processed: false,
      error: error.message,
    };
  }
}
