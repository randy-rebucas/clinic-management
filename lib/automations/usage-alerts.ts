/**
 * Usage Alerts Automation
 * Sends alerts when approaching subscription limits (80%, 90%, 100%)
 */

import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import { getSubscriptionUsage } from '@/lib/subscription-limits';
import { getStorageUsageSummary } from '@/lib/storage-tracking';
import { checkSubscriptionStatus } from '@/lib/subscription';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { getSettings } from '@/lib/settings';
import { Types } from 'mongoose';

export interface UsageAlert {
  tenantId: Types.ObjectId;
  alertType: 'patients' | 'users' | 'doctors' | 'appointments' | 'visits' | 'storage';
  current: number;
  limit: number | null;
  percentage: number;
  threshold: 80 | 90 | 100;
  message: string;
}

/**
 * Check usage and send alerts if thresholds are met
 */
export async function checkAndSendUsageAlerts(tenantId: string | Types.ObjectId): Promise<{
  success: boolean;
  alertsSent: number;
  alerts: UsageAlert[];
}> {
  try {
    await connectDB();

    const tenantIdObj = typeof tenantId === 'string' 
      ? new Types.ObjectId(tenantId) 
      : tenantId;

    const tenant = await Tenant.findById(tenantIdObj);
    if (!tenant) {
      return { success: false, alertsSent: 0, alerts: [] };
    }

    // Get subscription status
    const subscriptionStatus = await checkSubscriptionStatus(tenantIdObj);
    if (!subscriptionStatus.isActive || subscriptionStatus.isExpired) {
      // Don't send alerts for expired subscriptions
      return { success: true, alertsSent: 0, alerts: [] };
    }

    // Get usage statistics
    const usage = await getSubscriptionUsage(tenantIdObj);
    const storageSummary = await getStorageUsageSummary(tenantIdObj);

    const alerts: UsageAlert[] = [];

    // Check each limit type
    const checkLimit = (
      current: number,
      limit: number | null,
      type: UsageAlert['alertType'],
      name: string
    ) => {
      if (limit === null) return; // Unlimited

      const percentage = (current / limit) * 100;

      // Check thresholds
      if (percentage >= 100) {
        alerts.push({
          tenantId: tenantIdObj,
          alertType: type,
          current,
          limit,
          percentage,
          threshold: 100,
          message: `${name} limit (${limit}) has been reached. Please upgrade your plan.`,
        });
      } else if (percentage >= 90) {
        alerts.push({
          tenantId: tenantIdObj,
          alertType: type,
          current,
          limit,
          percentage,
          threshold: 90,
          message: `${name} usage is at ${percentage.toFixed(0)}% (${current}/${limit}). Please upgrade soon.`,
        });
      } else if (percentage >= 80) {
        alerts.push({
          tenantId: tenantIdObj,
          alertType: type,
          current,
          limit,
          percentage,
          threshold: 80,
          message: `${name} usage is at ${percentage.toFixed(0)}% (${current}/${limit}). Consider upgrading.`,
        });
      }
    };

    // Check all limits
    checkLimit(usage.patients.current, usage.patients.limit, 'patients', 'Patients');
    checkLimit(usage.users.current, usage.users.limit, 'users', 'Users');
    checkLimit(usage.doctors.current, usage.doctors.limit, 'doctors', 'Doctors');
    checkLimit(usage.appointmentsThisMonth.current, usage.appointmentsThisMonth.limit, 'appointments', 'Monthly appointments');
    checkLimit(usage.visitsThisMonth.current, usage.visitsThisMonth.limit, 'visits', 'Monthly visits');
    checkLimit(usage.storage.currentGB, usage.storage.limitGB, 'storage', 'Storage');

    // Send alerts
    let alertsSent = 0;
    if (alerts.length > 0) {
      // Get admin users
      const adminUsers = await User.find({
        tenantId: tenantIdObj,
        role: { $exists: true },
        active: true,
      }).populate('role', 'name').select('email firstName lastName');

      // Filter to actual admins (you may need to adjust this based on your role structure)
      const admins = adminUsers.filter((user: any) => 
        user.role?.name?.toLowerCase().includes('admin') || 
        user.role?.name?.toLowerCase().includes('administrator')
      );

      if (admins.length === 0) {
        // Fallback: use all users with tenantId
        const allUsers = await User.find({
          tenantId: tenantIdObj,
          active: true,
        }).limit(5).select('email firstName lastName');
        admins.push(...allUsers);
      }

      const settings = await getSettings(tenantIdObj.toString());
      const clinicName = settings?.clinicName || tenant.name || 'Clinic';
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
      const subscriptionUrl = `${baseUrl}/subscription`;

      // Group alerts by threshold
      const criticalAlerts = alerts.filter(a => a.threshold === 100);
      const warningAlerts = alerts.filter(a => a.threshold === 90);
      const infoAlerts = alerts.filter(a => a.threshold === 80);

      for (const admin of admins) {
        // Send email
        if (admin.email) {
          try {
            const emailContent = generateUsageAlertEmail(
              clinicName,
              criticalAlerts,
              warningAlerts,
              infoAlerts,
              subscriptionUrl
            );
            await sendEmail({
              to: admin.email,
              subject: emailContent.subject,
              html: emailContent.html,
            });
            alertsSent++;
          } catch (error) {
            console.error(`Error sending usage alert email to ${admin.email}:`, error);
          }
        }

        // Send in-app notification
        try {
          const alertMessages = alerts.map(a => a.message).join('\n');
          await createNotification({
            userId: admin._id,
            tenantId: tenantIdObj,
            type: 'system',
            priority: criticalAlerts.length > 0 ? 'high' : warningAlerts.length > 0 ? 'normal' : 'low',
            title: 'Usage Alert',
            message: alertMessages,
            actionUrl: subscriptionUrl,
          });
        } catch (error) {
          console.error(`Error creating usage alert notification:`, error);
        }
      }
    }

    return { success: true, alertsSent, alerts };
  } catch (error: any) {
    console.error('Error checking and sending usage alerts:', error);
    return { success: false, alertsSent: 0, alerts: [] };
  }
}

/**
 * Process usage alerts for all active tenants
 * Should be called by a cron job
 */
export async function processUsageAlerts(): Promise<{
  success: boolean;
  tenantsProcessed: number;
  totalAlertsSent: number;
}> {
  try {
    await connectDB();

    // Get all active tenants with active subscriptions
    const tenants = await Tenant.find({
      'subscription.status': 'active',
      status: 'active',
    }).select('_id subscription');

    let tenantsProcessed = 0;
    let totalAlertsSent = 0;

    for (const tenant of tenants) {
      try {
        const result = await checkAndSendUsageAlerts(tenant._id);
        if (result.success) {
          tenantsProcessed++;
          totalAlertsSent += result.alertsSent;
        }
      } catch (error) {
        console.error(`Error processing alerts for tenant ${tenant._id}:`, error);
      }
    }

    return {
      success: true,
      tenantsProcessed,
      totalAlertsSent,
    };
  } catch (error: any) {
    console.error('Error processing usage alerts:', error);
    return {
      success: false,
      tenantsProcessed: 0,
      totalAlertsSent: 0,
    };
  }
}

/**
 * Generate usage alert email
 */
function generateUsageAlertEmail(
  clinicName: string,
  criticalAlerts: UsageAlert[],
  warningAlerts: UsageAlert[],
  infoAlerts: UsageAlert[],
  subscriptionUrl: string
): { subject: string; html: string } {
  const hasCritical = criticalAlerts.length > 0;
  const hasWarnings = warningAlerts.length > 0;

  const subject = hasCritical
    ? '⚠️ URGENT: Subscription Limits Reached'
    : hasWarnings
    ? '⚠️ Warning: Approaching Subscription Limits'
    : 'ℹ️ Usage Alert: Subscription Limits';

  const alertSection = (alerts: UsageAlert[], title: string, color: string) => {
    if (alerts.length === 0) return '';

    return `
      <div style="background-color: ${color}15; border-left: 4px solid ${color}; padding: 15px; margin: 10px 0;">
        <h3 style="color: ${color}; margin-top: 0;">${title}</h3>
        <ul>
          ${alerts.map(a => `<li>${a.message}</li>`).join('')}
        </ul>
      </div>
    `;
  };

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: ${hasCritical ? '#dc2626' : hasWarnings ? '#f59e0b' : '#2196F3'}; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .button { display: inline-block; padding: 12px 24px; margin: 10px 0; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${hasCritical ? '⚠️ URGENT' : hasWarnings ? '⚠️ Warning' : 'ℹ️ Alert'}</h1>
        </div>
        <div class="content">
          <p>Dear ${clinicName} Administrator,</p>
          <p>Your subscription usage has reached the following thresholds:</p>
          
          ${alertSection(criticalAlerts, 'Critical (100% - Limit Reached)', '#dc2626')}
          ${alertSection(warningAlerts, 'Warning (90% - Approaching Limit)', '#f59e0b')}
          ${alertSection(infoAlerts, 'Info (80% - Consider Upgrade)', '#2196F3')}
          
          <p><strong>Recommended Actions:</strong></p>
          <ul>
            <li>Review your current usage on the subscription dashboard</li>
            <li>Consider upgrading your plan to avoid service interruptions</li>
            <li>Delete unused data if you're at storage limits</li>
            <li>Contact support if you need assistance</li>
          </ul>
          
          <p style="text-align: center;">
            <a href="${subscriptionUrl}" class="button">View Subscription & Upgrade</a>
          </p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return { subject, html };
}

