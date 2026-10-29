// Daily Reports Generation Automation
// Automatically generates and sends daily reports

import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import Invoice from '@/models/Invoice';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { dayRangeInTz, dayRangeOffsetInTz, formatInTz, combineDateAndTimeInTz } from '@/lib/tz';
import { Types } from 'mongoose';
import { forEachTenant, getTenantTimezone, getTenantStaff, automationEnabled, type AutomationTenant } from './shared';

export interface DailyReportOptions {
  tenantId?: string | Types.ObjectId;
  /** Any instant inside the clinic-local day to report on. */
  date?: Date;
  /** Clinic-local calendar day "yyyy-MM-dd" (takes precedence over `date`). */
  day?: string;
  recipients?: string[];
  sendEmail?: boolean;
}

async function resolveDayRange(options: DailyReportOptions, tz: string) {
  if (options.day && /^\d{4}-\d{2}-\d{2}$/.test(options.day)) {
    return dayRangeInTz(combineDateAndTimeInTz(options.day, '12:00', tz), tz);
  }
  if (options.date) return dayRangeInTz(options.date, tz);
  // Default: the previous full clinic-local day (the job runs early the next morning).
  return dayRangeOffsetInTz(-1, new Date(), tz);
}

/**
 * Generate daily report data for one tenant
 */
export async function generateDailyReport(options: DailyReportOptions = {}): Promise<{
  success: boolean;
  report?: any;
  error?: string;
}> {
  try {
    await connectDB();

    if (!options.tenantId) {
      return { success: false, error: 'Tenant is required' };
    }
    const tenantId = new Types.ObjectId(String(options.tenantId));
    const tz = await getTenantTimezone(tenantId);
    const { start: dateStart, end: dateEnd } = await resolveDayRange(options, tz);

    const tenantFilter = { tenantId };
    const inDay = { $gte: dateStart, $lte: dateEnd };

    const [
      newPatients,
      appointmentsByStatus,
      totalVisits,
      completedVisits,
      newInvoices,
      paidInvoices,
      outstandingBalance,
      revenueByMethod,
    ] = await Promise.all([
      Patient.countDocuments({ tenantIds: tenantId, createdAt: inDay }),
      Appointment.aggregate([
        { $match: { ...tenantFilter, appointmentDate: inDay } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Visit.countDocuments({ ...tenantFilter, date: inDay }),
      Visit.countDocuments({ ...tenantFilter, date: inDay, status: 'closed' }),
      Invoice.countDocuments({ ...tenantFilter, createdAt: inDay }),
      Invoice.countDocuments({ ...tenantFilter, 'payments.date': inDay, status: 'paid' }),
      Invoice.aggregate([
        { $match: { ...tenantFilter, status: { $in: ['unpaid', 'partial'] } } },
        { $group: { _id: null, total: { $sum: '$outstandingBalance' } } },
      ]),
      Invoice.aggregate([
        { $match: { ...tenantFilter, 'payments.date': inDay } },
        { $unwind: '$payments' },
        { $match: { 'payments.date': inDay } },
        { $group: { _id: '$payments.method', total: { $sum: '$payments.amount' } } },
      ]),
    ]);

    const byStatus = appointmentsByStatus.reduce((acc: Record<string, number>, item: any) => {
      acc[item._id || 'unknown'] = item.count;
      return acc;
    }, {});
    const totalAppointments = Object.values(byStatus).reduce((a: number, b: number) => a + b, 0);
    const byMethod = revenueByMethod.reduce((acc: Record<string, number>, item: any) => {
      acc[item._id || 'other'] = item.total || 0;
      return acc;
    }, {});
    // Revenue = payments received during the day (not invoice totals).
    const totalRevenue = Object.values(byMethod).reduce((a: number, b: number) => a + b, 0);

    const report = {
      date: formatInTz(dateStart, 'yyyy-MM-dd', tz),
      period: 'daily',
      summary: {
        newPatients,
        appointments: {
          total: totalAppointments,
          completed: byStatus.completed || 0,
          cancelled: byStatus.cancelled || 0,
          byStatus,
        },
        visits: {
          total: totalVisits,
          completed: completedVisits,
        },
        billing: {
          newInvoices,
          paidInvoices,
          totalRevenue,
          outstandingBalance: outstandingBalance[0]?.total || 0,
          revenueByMethod: byMethod,
        },
      },
      generatedAt: new Date().toISOString(),
      timezone: tz,
    };

    return { success: true, report };
  } catch (error: any) {
    console.error('Error generating daily report:', error);
    return {
      success: false,
      error: 'Failed to generate daily report',
    };
  }
}

type SendResult = { success: boolean; sent: number; errors: number; error?: string };

async function sendTenantDailyReport(tenant: AutomationTenant, options: DailyReportOptions): Promise<SendResult> {
  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoDailyReports')) {
    return { success: true, sent: 0, errors: 0 };
  }

  const reportResult = await generateDailyReport({ ...options, tenantId: tenant.tenantObjectId });
  if (!reportResult.success || !reportResult.report) {
    return { success: false, sent: 0, errors: 0, error: reportResult.error || 'Failed to generate report' };
  }

  let recipients: string[] = options.recipients || [];
  if (recipients.length === 0) {
    const users = await getTenantStaff(tenant.tenantObjectId, ['admin', 'accountant'], 'email');
    recipients = users.map((u: any) => u.email).filter(Boolean);
  }
  if (recipients.length === 0) {
    return { success: false, sent: 0, errors: 0, error: 'No recipients found' };
  }

  const emailContent = generateReportEmail(reportResult.report, settings, tenant.timezone);

  let sent = 0;
  let errors = 0;
  if (options.sendEmail !== false) {
    for (const recipient of recipients) {
      try {
        const emailResult = await sendEmail({ to: recipient, subject: emailContent.subject, html: emailContent.html });
        if (emailResult.success) sent++;
        else errors++;
      } catch (error) {
        console.error('Error sending daily report:', error);
        errors++;
      }
    }
  }

  return { success: true, sent, errors };
}

/**
 * Send daily report to recipients. Without a tenantId every active tenant is processed.
 */
export async function sendDailyReport(options: DailyReportOptions = {}): Promise<SendResult & { tenants?: unknown[] }> {
  try {
    await connectDB();
    const runs = await forEachTenant(options.tenantId, (t) => sendTenantDailyReport(t, options), { setting: 'autoDailyReports' });
    let sent = 0;
    let errors = 0;
    for (const run of runs) {
      sent += run.result?.sent ?? 0;
      errors += run.result?.errors ?? (run.success ? 0 : 1);
    }
    return {
      success: runs.every((r) => r.success),
      sent,
      errors,
      tenants: runs.map((r) => ({ tenantId: r.tenantId, success: r.success && !!r.result?.success, error: r.error || r.result?.error })),
    };
  } catch (error: any) {
    console.error('Error sending daily report:', error);
    return {
      success: false,
      sent: 0,
      errors: 1,
      error: 'Failed to send daily report',
    };
  }
}

function money(n: unknown): string {
  return (Number(n) || 0).toFixed(2);
}

/**
 * Generate report email
 */
function generateReportEmail(report: any, settings: any, tz: string): { subject: string; html: string } {
  const clinicName = settings.clinicName || 'Clinic';
  const reportDate = report.date;
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
          <h1>Daily Report - ${escapeHtml(reportDate)}</h1>
          <p>${escapeHtml(clinicName)}</p>
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
              <div class="metric-value">${money(report.summary.billing.totalRevenue)}</div>
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
                  <td>${escapeHtml(status)}</td>
                  <td>${Number(count) || 0}</td>
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
                <td><strong>${money(report.summary.billing.totalRevenue)}</strong></td>
              </tr>
              <tr>
                <td>Outstanding Balance</td>
                <td>${money(report.summary.billing.outstandingBalance)}</td>
              </tr>
            </table>
            ${Object.keys(report.summary.billing.revenueByMethod).length > 0 ? `
              <h3>Revenue by Payment Method</h3>
              <table>
                ${Object.entries(report.summary.billing.revenueByMethod).map(([method, amount]: [string, any]) => `
                  <tr>
                    <td>${escapeHtml(method)}</td>
                    <td>${money(amount)}</td>
                  </tr>
                `).join('')}
              </table>
            ` : ''}
          </div>

          <div class="section">
            <p><strong>Report Generated:</strong> ${escapeHtml(formatInTz(report.generatedAt, 'yyyy-MM-dd HH:mm', tz))}</p>
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
