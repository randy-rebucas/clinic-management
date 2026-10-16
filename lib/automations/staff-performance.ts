// Staff Performance Reports Automation
// Tracks and reports staff performance metrics

import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import Invoice from '@/models/Invoice';
import Prescription from '@/models/Prescription';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { previousWeekRangeInTz, previousMonthRangeInTz, formatInTz } from '@/lib/tz';
import { Types } from 'mongoose';
import { forEachTenant, automationEnabled, getTenantTimezone, getTenantStaff, displayDate } from './shared';

export interface StaffPerformanceReportOptions {
  period: 'weekly' | 'monthly';
  tenantId?: string | Types.ObjectId;
  sendEmail?: boolean;
  recipients?: string[];
  doctorId?: string | Types.ObjectId; // Optional: specific doctor
}

const MAX_DOCTORS = 200;

/**
 * Generate staff performance report for one tenant.
 * Covers the previous full Monday–Sunday week / previous calendar month (clinic-local).
 */
export async function generateStaffPerformanceReport(
  options: StaffPerformanceReportOptions
): Promise<{
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
    if (!automationEnabled(settings, 'autoStaffPerformanceReports')) {
      return { success: true };
    }

    const { period } = options;
    const tz = await getTenantTimezone(tenantId);
    const range = period === 'weekly' ? previousWeekRangeInTz(new Date(), tz) : previousMonthRangeInTz(new Date(), tz);
    const startDate = range.start;
    const endDate = range.end;
    const inRange = { $gte: startDate, $lte: endDate };

    const doctorQuery: Record<string, unknown> = { tenantId, status: 'active' };
    if (options.doctorId && Types.ObjectId.isValid(String(options.doctorId))) {
      doctorQuery._id = new Types.ObjectId(String(options.doctorId));
    }

    const doctors = await Doctor.find(doctorQuery).limit(MAX_DOCTORS).lean<any[]>();

    const performanceData = [];

    for (const doctor of doctors) {
      // Visits and prescriptions reference the doctor's User account, appointments the Doctor record.
      const user = await User.findOne({ tenantId, doctorProfile: doctor._id }).select('_id').lean<any>();
      const ids = [doctor._id, ...(user ? [user._id] : [])];

      const appointmentStats = await Appointment.aggregate([
        { $match: { tenantId, appointmentDate: inRange, $or: [{ doctor: { $in: ids } }, { provider: { $in: ids } }] } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);
      const count = (s: string) => appointmentStats.find((a: any) => a._id === s)?.count || 0;
      const totalAppointments = appointmentStats.reduce((sum: number, a: any) => sum + a.count, 0);
      const completedAppointments = count('completed');
      const cancelledAppointments = count('cancelled');
      const noShowAppointments = count('no-show');

      const visits = user
        ? await Visit.find({ tenantId, provider: user._id, date: inRange }).select('_id status').lean<any[]>()
        : [];
      const completedVisits = visits.filter((v) => v.status === 'closed').length;

      const invoices = visits.length
        ? await Invoice.find({ tenantId, visit: { $in: visits.map((v) => v._id) } }).select('total totalPaid').lean<any[]>()
        : [];
      const totalRevenue = invoices.reduce((sum: number, inv: any) => sum + (inv.totalPaid || 0), 0);
      const totalBilled = invoices.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0);

      const prescriptionCount = user
        ? await Prescription.countDocuments({ tenantId, prescribedBy: user._id, issuedAt: inRange })
        : 0;

      const rate = (n: number) => (totalAppointments > 0 ? ((n / totalAppointments) * 100).toFixed(1) : '0');
      const avgRevenuePerVisit = completedVisits > 0 ? (totalRevenue / completedVisits).toFixed(2) : '0';

      performanceData.push({
        doctorId: doctor._id,
        doctorName: `${doctor.firstName} ${doctor.lastName}`,
        specialization: doctor.specialization || 'General',
        metrics: {
          appointments: {
            total: totalAppointments,
            completed: completedAppointments,
            cancelled: cancelledAppointments,
            noShow: noShowAppointments,
            completionRate: `${rate(completedAppointments)}%`,
            noShowRate: `${rate(noShowAppointments)}%`,
            cancellationRate: `${rate(cancelledAppointments)}%`,
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
            total: prescriptionCount,
          },
        },
      });
    }

    performanceData.sort((a, b) => b.metrics.revenue.totalPaid - a.metrics.revenue.totalPaid);

    const report = {
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

    if (options.sendEmail !== false) {
      const recipients = options.recipients || (await getReportRecipients(tenantId));
      const emailContent = generateStaffPerformanceEmail(report, period, settings, tz);
      for (const recipient of recipients) {
        try {
          await sendEmail({ to: recipient, subject: emailContent.subject, html: emailContent.html });
        } catch (error) {
          console.error('Error sending staff performance report:', error);
        }
      }
    }

    return { success: true, report };
  } catch (error: any) {
    console.error('Error generating staff performance report:', error);
    return {
      success: false,
      error: 'Failed to generate staff performance report',
    };
  }
}

/**
 * Get report recipients (active admins of the tenant)
 */
async function getReportRecipients(tenantId: Types.ObjectId): Promise<string[]> {
  try {
    const users = await getTenantStaff(tenantId, ['admin'], 'email');
    return users.map((user: any) => user.email).filter(Boolean);
  } catch (error) {
    console.error('Error getting report recipients:', error);
    return [];
  }
}

function generateStaffPerformanceEmail(
  report: any,
  period: 'weekly' | 'monthly',
  settings: any,
  tz: string
): { subject: string; html: string } {
  const rawClinicName = settings.clinicName || 'Clinic';
  const clinicName = escapeHtml(rawClinicName);
  const periodLabel = period === 'weekly' ? 'Weekly' : 'Monthly';
  const subject = `${periodLabel} Staff Performance Report - ${rawClinicName}`;

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
          <p>${escapeHtml(displayDate(report.dateRange.start, tz))} - ${escapeHtml(displayDate(report.dateRange.end, tz))}</p>
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
                  <td>${escapeHtml(staff.doctorName)}</td>
                  <td>${escapeHtml(staff.specialization)}</td>
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

async function processStaffPerformance(period: 'weekly' | 'monthly', tenantId?: string | Types.ObjectId): Promise<ProcessResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, (t) =>
      generateStaffPerformanceReport({ period, tenantId: t.tenantObjectId, sendEmail: true })
    );
    return {
      success: runs.every((r) => r.success && r.result?.success),
      processed: runs.some((r) => !!r.result?.report),
      tenants: runs.map((r) => ({ tenantId: r.tenantId, success: r.success && !!r.result?.success, error: r.error || r.result?.error })),
    };
  } catch (error: any) {
    console.error(`Error processing ${period} staff performance:`, error);
    return { success: false, processed: false, error: `Failed to process ${period} staff performance` };
  }
}

/**
 * Process weekly staff performance reports. Without a tenantId every active tenant is processed.
 */
export async function processWeeklyStaffPerformance(tenantId?: string | Types.ObjectId): Promise<ProcessResult> {
  return processStaffPerformance('weekly', tenantId);
}

/**
 * Process monthly staff performance reports. Without a tenantId every active tenant is processed.
 */
export async function processMonthlyStaffPerformance(tenantId?: string | Types.ObjectId): Promise<ProcessResult> {
  return processStaffPerformance('monthly', tenantId);
}
