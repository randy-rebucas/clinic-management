// Periodic Reports Automation (Weekly/Monthly)
// Generates and sends weekly and monthly analytics reports

import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import Invoice from '@/models/Invoice';
import Prescription from '@/models/Prescription';
import LabResult from '@/models/LabResult';
import Doctor from '@/models/Doctor';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { previousWeekRangeInTz, previousMonthRangeInTz, formatInTz } from '@/lib/tz';
import { Types } from 'mongoose';
import { forEachTenant, automationEnabled, getTenantTimezone, getTenantStaff, displayDate } from './shared';

export interface PeriodicReportOptions {
  period: 'weekly' | 'monthly';
  tenantId?: string | Types.ObjectId;
  sendEmail?: boolean;
  recipients?: string[];
}

/**
 * Generate weekly or monthly analytics report for one tenant.
 * Covers the previous full Monday–Sunday week / previous calendar month (clinic-local).
 */
export async function generatePeriodicReport(options: PeriodicReportOptions): Promise<{
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

    const settings = await getSettings(tenantId.toString());
    if (!automationEnabled(settings, 'autoPeriodicReports')) {
      return { success: true };
    }

    const { period } = options;
    const tz = await getTenantTimezone(tenantId);
    const range = period === 'weekly' ? previousWeekRangeInTz(new Date(), tz) : previousMonthRangeInTz(new Date(), tz);
    const startDate = range.start;
    const endDate = range.end;
    const inRange = { $gte: startDate, $lte: endDate };

    const tenantFilter = { tenantId };

    const [
      totalPatients,
      newPatients,
      appointmentsByStatus,
      totalVisits,
      completedVisits,
      invoices,
      totalPrescriptions,
      totalLabResults,
      activeDoctors,
      outstanding,
      closedVisits,
    ] = await Promise.all([
      Patient.countDocuments({ tenantIds: tenantId }),
      Patient.countDocuments({ tenantIds: tenantId, createdAt: inRange }),
      Appointment.aggregate([
        { $match: { ...tenantFilter, appointmentDate: inRange } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Visit.countDocuments({ ...tenantFilter, date: inRange }),
      Visit.countDocuments({ ...tenantFilter, date: inRange, status: 'closed' }),
      Invoice.find({ ...tenantFilter, createdAt: inRange })
        .select('visit total totalPaid tax discounts payments')
        .lean(),
      Prescription.countDocuments({ ...tenantFilter, issuedAt: inRange }),
      LabResult.countDocuments({ ...tenantFilter, createdAt: inRange }),
      Doctor.countDocuments({ ...tenantFilter, status: 'active' }),
      Invoice.aggregate([
        { $match: { ...tenantFilter, status: { $in: ['unpaid', 'partial'] } } },
        { $group: { _id: null, total: { $sum: '$outstandingBalance' } } },
      ]),
      Visit.find({ ...tenantFilter, date: inRange, status: 'closed' })
        .select('_id provider')
        .populate('provider', 'name')
        .lean(),
    ]);

    const statusCount = (s: string) => appointmentsByStatus.find((a: any) => a._id === s)?.count || 0;
    const totalAppointments = appointmentsByStatus.reduce((sum: number, a: any) => sum + a.count, 0);
    const completedAppointments = statusCount('completed');
    const cancelledAppointments = statusCount('cancelled');
    const noShowAppointments = statusCount('no-show');

    const invoiceList = invoices as any[];
    const totalBilled = invoiceList.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalPaid = invoiceList.reduce((sum, inv) => sum + (inv.totalPaid || 0), 0);
    const totalDiscounts = invoiceList.reduce(
      (sum, inv) => sum + (inv.discounts || []).reduce((s: number, d: any) => s + (d.amount || 0), 0),
      0
    );
    const totalTax = invoiceList.reduce((sum, inv) => sum + (inv.tax || 0), 0);
    const totalOutstanding = outstanding[0]?.total || 0;

    const revenueByMethod: Record<string, number> = {};
    invoiceList.forEach((inv) => {
      inv.payments?.forEach((payment: any) => {
        const method = payment.method || 'unknown';
        revenueByMethod[method] = (revenueByMethod[method] || 0) + (payment.amount || 0);
      });
    });

    const paidByVisit = new Map<string, number>();
    for (const inv of invoiceList) {
      if (inv.visit) paidByVisit.set(String(inv.visit), (paidByVisit.get(String(inv.visit)) || 0) + (inv.totalPaid || 0));
    }
    const revenueByDoctor: Record<string, number> = {};
    (closedVisits as any[]).forEach((visit) => {
      const name = visit.provider?.name;
      if (name) {
        revenueByDoctor[name] = (revenueByDoctor[name] || 0) + (paidByVisit.get(String(visit._id)) || 0);
      }
    });

    const completionRate = totalAppointments > 0 ? ((completedAppointments / totalAppointments) * 100).toFixed(1) : '0';
    const noShowRate = totalAppointments > 0 ? ((noShowAppointments / totalAppointments) * 100).toFixed(1) : '0';
    const avgRevenuePerVisit = completedVisits > 0 ? (totalPaid / completedVisits).toFixed(2) : '0';

    const report = {
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
          active: activeDoctors,
        },
      },
      generatedAt: new Date().toISOString(),
    };

    if (options.sendEmail !== false) {
      const recipients = options.recipients || (await getReportRecipients(tenantId));
      const emailContent = generatePeriodicReportEmail(report, period, settings, tz);
      for (const recipient of recipients) {
        try {
          await sendEmail({ to: recipient, subject: emailContent.subject, html: emailContent.html });
        } catch (error) {
          console.error('Error sending periodic report:', error);
        }
      }
    }

    return { success: true, report };
  } catch (error: any) {
    console.error('Error generating periodic report:', error);
    return {
      success: false,
      error: 'Failed to generate periodic report',
    };
  }
}

/**
 * Get report recipients (active admins and accountants of the tenant)
 */
async function getReportRecipients(tenantId: Types.ObjectId): Promise<string[]> {
  try {
    const users = await getTenantStaff(tenantId, ['admin', 'accountant'], 'email');
    return users.map((user: any) => user.email).filter(Boolean);
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
  settings: any,
  tz: string
): { subject: string; html: string } {
  const rawClinicName = settings.clinicName || 'Clinic';
  const clinicName = escapeHtml(rawClinicName);
  const periodLabel = period === 'weekly' ? 'Weekly' : 'Monthly';
  const subject = `${periodLabel} Analytics Report - ${rawClinicName}`;

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
          <p>${escapeHtml(displayDate(report.dateRange.start, tz))} - ${escapeHtml(displayDate(report.dateRange.end, tz))}</p>
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
                  <tr><td>${escapeHtml(method)}</td><td>₱${amount.toLocaleString()}</td></tr>
                `).join('')}
              </table>
            ` : ''}

            ${Object.keys(report.summary.revenue.byDoctor).length > 0 ? `
              <h3>Revenue by Doctor</h3>
              <table>
                <tr><th>Doctor</th><th>Revenue</th></tr>
                ${Object.entries(report.summary.revenue.byDoctor).map(([doctor, revenue]: [string, any]) => `
                  <tr><td>${escapeHtml(doctor)}</td><td>₱${revenue.toLocaleString()}</td></tr>
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
          <p>Report generated on ${escapeHtml(formatInTz(report.generatedAt, 'yyyy-MM-dd HH:mm', tz))}</p>
          <p>This is an automated report. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}

type ProcessResult = {
  success: boolean;
  processed: boolean;
  error?: string;
  tenants?: Array<{ tenantId: string; success: boolean; error?: string }>;
};

async function processPeriodic(period: 'weekly' | 'monthly', tenantId?: string | Types.ObjectId): Promise<ProcessResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, (t) =>
      generatePeriodicReport({ period, tenantId: t.tenantObjectId, sendEmail: true }),
      { setting: 'autoPeriodicReports' }
    );
    return {
      success: runs.every((r) => r.success && r.result?.success),
      processed: runs.some((r) => !!r.result?.report),
      tenants: runs.map((r) => ({
        tenantId: r.tenantId,
        success: r.success && !!r.result?.success,
        error: r.error || r.result?.error,
      })),
    };
  } catch (error: any) {
    console.error(`Error processing ${period} reports:`, error);
    return { success: false, processed: false, error: `Failed to process ${period} reports` };
  }
}

/**
 * Process weekly reports (previous Monday–Sunday). Without a tenantId every active tenant is processed.
 */
export async function processWeeklyReports(tenantId?: string | Types.ObjectId): Promise<ProcessResult> {
  return processPeriodic('weekly', tenantId);
}

/**
 * Process monthly reports (previous calendar month). Without a tenantId every active tenant is processed.
 */
export async function processMonthlyReports(tenantId?: string | Types.ObjectId): Promise<ProcessResult> {
  return processPeriodic('monthly', tenantId);
}