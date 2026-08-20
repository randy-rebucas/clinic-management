// Daily Reports Generation Automation
// Automatically generates and sends daily reports

import prisma from '@/lib/prisma';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getAutomationSettings, getOrCreateSettings } from '@/lib/data/settings';
import { listActiveUsersByRoleNames } from '@/lib/data/user';
import { sendEmail } from '@/lib/email';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export interface DailyReportOptions {
  tenantId?: string;
  date?: Date;
  recipients?: string[];
  sendEmail?: boolean;
}

/**
 * Generate daily report data
 */
export async function generateDailyReport(options: DailyReportOptions = {}): Promise<{
  success: boolean;
  report?: any;
  error?: string;
}> {
  try {
    const tenantId = options.tenantId ?? null;

    const reportDate = options.date || new Date();
    const dateStart = new Date(reportDate);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(reportDate);
    dateEnd.setHours(23, 59, 59, 999);

    const report = await run(tenantId, async () => {
      const [
        newPatients,
        totalAppointments,
        completedAppointments,
        cancelledAppointments,
        totalVisits,
        completedVisits,
        newInvoices,
        paidInvoicesToday,
        appointmentsByStatus,
        invoicesWithPaymentToday,
      ] = await Promise.all([
        prisma.patient.count({ where: { createdAt: { gte: dateStart, lte: dateEnd } } }),
        prisma.appointment.count({ where: { appointmentDate: { gte: dateStart, lte: dateEnd } } }),
        prisma.appointment.count({ where: { appointmentDate: { gte: dateStart, lte: dateEnd }, status: 'completed' } }),
        prisma.appointment.count({ where: { appointmentDate: { gte: dateStart, lte: dateEnd }, status: 'cancelled' } }),
        prisma.visit.count({ where: { date: { gte: dateStart, lte: dateEnd } } }),
        prisma.visit.count({ where: { date: { gte: dateStart, lte: dateEnd }, status: 'closed' } }),
        prisma.invoice.count({ where: { createdAt: { gte: dateStart, lte: dateEnd } } }),
        prisma.invoice.findMany({
          where: { status: 'paid', payments: { some: { date: { gte: dateStart, lte: dateEnd } } } },
        }),
        prisma.appointment.groupBy({
          by: ['status'],
          where: { appointmentDate: { gte: dateStart, lte: dateEnd } },
          _count: { _all: true },
        }),
        prisma.invoice.findMany({
          where: { payments: { some: { date: { gte: dateStart, lte: dateEnd } } } },
          include: { payments: true },
        }),
      ]);

      // Total revenue today: sum of payments dated today across all invoices
      let totalRevenue = 0;
      const revenueByMethod: Record<string, number> = {};
      for (const inv of invoicesWithPaymentToday) {
        for (const payment of inv.payments) {
          if (payment.date >= dateStart && payment.date <= dateEnd) {
            totalRevenue += payment.amount || 0;
            const method = payment.method || 'unknown';
            revenueByMethod[method] = (revenueByMethod[method] || 0) + (payment.amount || 0);
          }
        }
      }

      // Outstanding balance across all unpaid/partial invoices
      const outstandingInvoices = await prisma.invoice.findMany({
        where: { status: { in: ['unpaid', 'partial'] } },
        select: { outstandingBalance: true },
      });
      const outstandingBalance = outstandingInvoices.reduce((sum, i) => sum + (i.outstandingBalance || 0), 0);

      return {
        date: reportDate.toISOString().split('T')[0],
        period: 'daily',
        summary: {
          newPatients,
          appointments: {
            total: totalAppointments,
            completed: completedAppointments,
            cancelled: cancelledAppointments,
            byStatus: appointmentsByStatus.reduce((acc: any, item) => {
              acc[item.status] = item._count._all;
              return acc;
            }, {}),
          },
          visits: {
            total: totalVisits,
            completed: completedVisits,
          },
          billing: {
            newInvoices,
            paidInvoices: paidInvoicesToday.length,
            totalRevenue,
            outstandingBalance,
            revenueByMethod,
          },
        },
        generatedAt: new Date().toISOString(),
      };
    });

    return { success: true, report };
  } catch (error: any) {
    console.error('Error generating daily report:', error);
    return {
      success: false,
      error: error.message || 'Failed to generate daily report',
    };
  }
}

/**
 * Send daily report to recipients
 */
export async function sendDailyReport(options: DailyReportOptions = {}): Promise<{
  success: boolean;
  sent: number;
  errors: number;
  error?: string;
}> {
  try {
    const tenantId = options.tenantId ?? null;

    const automationSettings = await run(tenantId, () => getAutomationSettings(tenantId));
    if (!automationSettings.autoDailyReports) {
      return { success: true, sent: 0, errors: 0 };
    }

    // Generate report
    const reportResult = await generateDailyReport(options);
    if (!reportResult.success || !reportResult.report) {
      return {
        success: false,
        sent: 0,
        errors: 0,
        error: reportResult.error || 'Failed to generate report',
      };
    }

    const report = reportResult.report;
    const settings = await run(tenantId, () => getOrCreateSettings(tenantId));

    // Get recipients
    let recipients: string[] = options.recipients || [];

    if (recipients.length === 0) {
      const users = await run(tenantId, () => listActiveUsersByRoleNames(['admin', 'accountant']));
      recipients = users.map((u) => u.email).filter(Boolean);
    }

    if (recipients.length === 0) {
      return {
        success: false,
        sent: 0,
        errors: 0,
        error: 'No recipients found',
      };
    }

    // Generate email content
    const emailContent = generateReportEmail(report, settings);

    let sent = 0;
    let errors = 0;

    // Send email to all recipients
    if (options.sendEmail !== false) {
      for (const recipient of recipients) {
        try {
          const emailResult = await sendEmail({
            to: recipient,
            subject: emailContent.subject,
            html: emailContent.html,
          });

          if (emailResult.success) {
            sent++;
          } else {
            errors++;
          }
        } catch (error) {
          console.error(`Error sending daily report to ${recipient}:`, error);
          errors++;
        }
      }
    }

    return { success: true, sent, errors };
  } catch (error: any) {
    console.error('Error sending daily report:', error);
    return {
      success: false,
      sent: 0,
      errors: 1,
      error: error.message || 'Failed to send daily report',
    };
  }
}

/**
 * Generate report email
 */
function generateReportEmail(report: any, settings: any): { subject: string; html: string } {
  const clinicName = settings.clinicName || 'Clinic';
  const reportDate = new Date(report.date).toLocaleDateString();
  const subject = `Daily Report - ${clinicName} - ${reportDate}`;

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
        .metric { display: inline-block; margin: 10px 20px 10px 0; }
        .metric-value { font-size: 2em; font-weight: bold; color: #2196F3; }
        .metric-label { font-size: 0.9em; color: #666; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        table th, table td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        table th { background-color: #f2f2f2; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Daily Report - ${reportDate}</h1>
          <p>${clinicName}</p>
        </div>
        <div class="content">
          <div class="section">
            <h2>Summary</h2>
            <div class="metric">
              <div class="metric-value">${report.summary.newPatients}</div>
              <div class="metric-label">New Patients</div>
            </div>
            <div class="metric">
              <div class="metric-value">${report.summary.appointments.total}</div>
              <div class="metric-label">Appointments</div>
            </div>
            <div class="metric">
              <div class="metric-value">${report.summary.visits.total}</div>
              <div class="metric-label">Visits</div>
            </div>
            <div class="metric">
              <div class="metric-value">${report.summary.billing.totalRevenue.toFixed(2)}</div>
              <div class="metric-label">Revenue</div>
            </div>
          </div>

          <div class="section">
            <h2>Appointments</h2>
            <table>
              <tr>
                <th>Status</th>
                <th>Count</th>
              </tr>
              ${Object.entries(report.summary.appointments.byStatus).map(([status, count]: [string, any]) => `
                <tr>
                  <td>${status}</td>
                  <td>${count}</td>
                </tr>
              `).join('')}
              <tr>
                <td><strong>Total</strong></td>
                <td><strong>${report.summary.appointments.total}</strong></td>
              </tr>
            </table>
          </div>

          <div class="section">
            <h2>Billing</h2>
            <table>
              <tr>
                <td>New Invoices</td>
                <td>${report.summary.billing.newInvoices}</td>
              </tr>
              <tr>
                <td>Paid Invoices</td>
                <td>${report.summary.billing.paidInvoices}</td>
              </tr>
              <tr>
                <td>Total Revenue</td>
                <td><strong>${report.summary.billing.totalRevenue.toFixed(2)}</strong></td>
              </tr>
              <tr>
                <td>Outstanding Balance</td>
                <td>${report.summary.billing.outstandingBalance.toFixed(2)}</td>
              </tr>
            </table>
            ${Object.keys(report.summary.billing.revenueByMethod).length > 0 ? `
              <h3>Revenue by Payment Method</h3>
              <table>
                ${Object.entries(report.summary.billing.revenueByMethod).map(([method, amount]: [string, any]) => `
                  <tr>
                    <td>${method}</td>
                    <td>${amount.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </table>
            ` : ''}
          </div>

          <div class="section">
            <p><strong>Report Generated:</strong> ${new Date(report.generatedAt).toLocaleString()}</p>
          </div>
        </div>
        <div class="footer">
          <p>This is an automated daily report. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}
