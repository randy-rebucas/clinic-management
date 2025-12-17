// Trial Expiration Automation
// Handles trial expiration and enforces limitations

import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import Patient from '@/models/Patient';
import User from '@/models/User';
import Doctor from '@/models/Doctor';
import Appointment from '@/models/Appointment';
import Visit from '@/models/Visit';
import { getSettings } from '@/lib/settings';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';
import { createNotification } from '@/lib/notifications';
import { Types } from 'mongoose';

export interface TrialExpirationOptions {
  tenantId: string | Types.ObjectId;
  sendNotifications?: boolean;
  enforceLimitations?: boolean;
}

/**
 * Handle trial expiration
 */
export async function handleTrialExpiration(options: TrialExpirationOptions): Promise<{
  success: boolean;
  handled: boolean;
  actions: string[];
  error?: string;
}> {
  try {
    await connectDB();

    const tenantId = typeof options.tenantId === 'string' 
      ? new Types.ObjectId(options.tenantId) 
      : options.tenantId;

    const tenant = await Tenant.findById(tenantId);

    if (!tenant) {
      return { success: false, handled: false, actions: [], error: 'Tenant not found' };
    }

    // Check if subscription is trial and expired
    if (!tenant.subscription || tenant.subscription.plan !== 'trial') {
      return { success: true, handled: false, actions: [] };
    }

    const now = new Date();
    const expiresAt = tenant.subscription.expiresAt 
      ? new Date(tenant.subscription.expiresAt) 
      : null;

    if (!expiresAt || expiresAt > now) {
      return { success: true, handled: false, actions: [] };
    }

    // Trial has expired
    const actions: string[] = [];

    // 1. Update subscription status
    tenant.subscription.status = 'expired';
    await tenant.save();
    actions.push('Subscription status updated to expired');

    // 2. Send expiration notifications
    if (options.sendNotifications !== false) {
      await sendTrialExpirationNotifications(tenant);
      actions.push('Expiration notifications sent');
    }

    // 3. Enforce limitations (restrict access)
    if (options.enforceLimitations !== false) {
      await enforceTrialLimitations(tenantId);
      actions.push('Trial limitations enforced');
    }

    return { success: true, handled: true, actions };
  } catch (error: any) {
    console.error('Error handling trial expiration:', error);
    return {
      success: false,
      handled: false,
      actions: [],
      error: error.message || 'Failed to handle trial expiration',
    };
  }
}

/**
 * Send trial expiration notifications
 */
async function sendTrialExpirationNotifications(tenant: any): Promise<void> {
  try {
    // Get admin users
    const adminUsers = await User.find({
      tenantId: tenant._id,
      role: 'admin',
      active: true,
    }).select('email phone firstName lastName');

    const settings = await getSettings(tenant._id.toString());
    const clinicName = settings?.clinicName || tenant.name || 'Clinic';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
    const subscriptionUrl = `${baseUrl}/subscription`;

    // Send notifications to all admins
    for (const admin of adminUsers) {
      // Send email
      if (admin.email) {
        try {
          const emailContent = generateTrialExpirationEmail(tenant, clinicName, subscriptionUrl);
          await sendEmail({
            to: admin.email,
            subject: emailContent.subject,
            html: emailContent.html,
          });
        } catch (error) {
          console.error(`Error sending trial expiration email to ${admin.email}:`, error);
        }
      }

      // Send SMS
      if (admin.phone) {
        try {
          let phoneNumber = admin.phone.trim();
          if (!phoneNumber.startsWith('+')) {
            phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
          }

          const message = `Your ${clinicName} trial period has expired. Please subscribe to continue using the service. Visit ${subscriptionUrl}`;

          await sendSMS({
            to: phoneNumber,
            message,
          });
        } catch (error) {
          console.error(`Error sending trial expiration SMS to ${admin.phone}:`, error);
        }
      }

      // Send in-app notification
      try {
        await createNotification({
          userId: admin._id,
          tenantId: tenant._id,
          type: 'system',
          priority: 'high',
          title: 'Trial Period Expired',
          message: 'Your trial period has expired. Please subscribe to continue using the service.',
          actionUrl: subscriptionUrl,
        });
      } catch (error) {
        console.error(`Error creating trial expiration notification for ${admin._id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error sending trial expiration notifications:', error);
  }
}

/**
 * Enforce trial limitations (restrict access)
 */
async function enforceTrialLimitations(tenantId: Types.ObjectId): Promise<void> {
  try {
    // The actual enforcement happens via middleware and API checks
    // This function can be used to mark tenant as restricted
    // or perform any cleanup actions
    
    // For now, the subscription status being 'expired' is enough
    // The middleware will handle redirects and API will enforce limits
  } catch (error) {
    console.error('Error enforcing trial limitations:', error);
  }
}

/**
 * Process all expired trials
 * This should be called by a cron job
 */
export async function processExpiredTrials(): Promise<{
  success: boolean;
  processed: number;
  expired: number;
  errors: number;
  results: Array<{ tenantId: string; success: boolean; error?: string }>;
}> {
  try {
    await connectDB();

    // Find all tenants with expired trial subscriptions
    const now = new Date();
    const query = {
      'subscription.plan': 'trial',
      'subscription.status': 'active',
      'subscription.expiresAt': { $lte: now },
    };

    const expiredTenants = await Tenant.find(query);

    const results: Array<{ tenantId: string; success: boolean; error?: string }> = [];
    let expired = 0;
    let errors = 0;

    for (const tenant of expiredTenants) {
      const result = await handleTrialExpiration({
        tenantId: tenant._id,
        sendNotifications: true,
        enforceLimitations: true,
      });

      results.push({
        tenantId: tenant._id.toString(),
        success: result.success,
        error: result.error,
      });

      if (result.success && result.handled) {
        expired++;
      } else if (!result.success) {
        errors++;
      }
    }

    return {
      success: true,
      processed: expiredTenants.length,
      expired,
      errors,
      results,
    };
  } catch (error: any) {
    console.error('Error processing expired trials:', error);
    return {
      success: false,
      processed: 0,
      expired: 0,
      errors: 1,
      results: [{ tenantId: 'unknown', success: false, error: error.message }],
    };
  }
}

/**
 * Send trial expiration warnings (before expiration)
 */
export async function sendTrialExpirationWarnings(): Promise<{
  success: boolean;
  warningsSent: number;
  errors: number;
}> {
  try {
    await connectDB();

    // Find tenants with trials expiring in 3 days or less
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const query = {
      'subscription.plan': 'trial',
      'subscription.status': 'active',
      'subscription.expiresAt': {
        $gte: now,
        $lte: threeDaysFromNow,
      },
    };

    const expiringTenants = await Tenant.find(query);

    let warningsSent = 0;
    let errors = 0;

    for (const tenant of expiringTenants) {
      try {
        // Get admin users
        const adminUsers = await User.find({
          tenantId: tenant._id,
          role: 'admin',
          active: true,
        }).select('email phone firstName lastName');

        const expiresAt = tenant.subscription?.expiresAt 
          ? new Date(tenant.subscription.expiresAt) 
          : null;
        
        if (!expiresAt) continue;

        const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        const settings = await getSettings(tenant._id.toString());
        const clinicName = settings?.clinicName || tenant.name || 'Clinic';
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
        const subscriptionUrl = `${baseUrl}/subscription`;

        for (const admin of adminUsers) {
          // Send email warning
          if (admin.email) {
            try {
              const emailContent = generateTrialWarningEmail(tenant, daysRemaining, clinicName, subscriptionUrl);
              await sendEmail({
                to: admin.email,
                subject: emailContent.subject,
                html: emailContent.html,
              });
            } catch (error) {
              console.error(`Error sending trial warning email:`, error);
            }
          }

          // Send in-app notification
          try {
            await createNotification({
              userId: admin._id,
              tenantId: tenant._id,
              type: 'system',
              priority: 'high',
              title: `Trial Expiring in ${daysRemaining} Day${daysRemaining !== 1 ? 's' : ''}`,
              message: `Your trial period expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}. Please subscribe to continue.`,
              actionUrl: subscriptionUrl,
            });
          } catch (error) {
            console.error(`Error creating trial warning notification:`, error);
          }
        }

        warningsSent++;
      } catch (error) {
        console.error(`Error sending warning for tenant ${tenant._id}:`, error);
        errors++;
      }
    }

    return { success: true, warningsSent, errors };
  } catch (error: any) {
    console.error('Error sending trial expiration warnings:', error);
    return { success: false, warningsSent: 0, errors: 1 };
  }
}

/**
 * Generate trial expiration email
 */
function generateTrialExpirationEmail(tenant: any, clinicName: string, subscriptionUrl: string): { subject: string; html: string } {
  const subject = 'Trial Period Expired - Action Required';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .warning-box { background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 10px 0; }
        .button { display: inline-block; padding: 12px 24px; margin: 10px 0; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚠️ Trial Period Expired</h1>
        </div>
        <div class="content">
          <p>Dear ${tenant.name || 'Valued Customer'},</p>
          <div class="warning-box">
            <h2>Your trial period has expired</h2>
            <p>Your 7-day trial period for ${clinicName} has ended. To continue using our services, please subscribe to one of our plans.</p>
          </div>
          <p><strong>What happens now?</strong></p>
          <ul>
            <li>Your account access is now limited</li>
            <li>You'll be redirected to the subscription page</li>
            <li>Choose a plan to restore full access</li>
          </ul>
          <p style="text-align: center;">
            <a href="${subscriptionUrl}" class="button">Subscribe Now</a>
          </p>
          <p>If you have any questions, please contact our support team.</p>
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

/**
 * Generate trial warning email
 */
function generateTrialWarningEmail(
  tenant: any,
  daysRemaining: number,
  clinicName: string,
  subscriptionUrl: string
): { subject: string; html: string } {
  const subject = `Trial Expiring in ${daysRemaining} Day${daysRemaining !== 1 ? 's' : ''} - Action Required`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #f59e0b; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .warning-box { background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 10px 0; }
        .button { display: inline-block; padding: 12px 24px; margin: 10px 0; background-color: #2196F3; color: white; text-decoration: none; border-radius: 4px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⏰ Trial Expiring Soon</h1>
        </div>
        <div class="content">
          <p>Dear ${tenant.name || 'Valued Customer'},</p>
          <div class="warning-box">
            <h2>Your trial expires in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}</h2>
            <p>Your 7-day trial period for ${clinicName} will end soon. Subscribe now to continue enjoying all features without interruption.</p>
          </div>
          <p><strong>Don't lose access to:</strong></p>
          <ul>
            <li>Patient management</li>
            <li>Appointment scheduling</li>
            <li>Visit records</li>
            <li>Prescriptions and lab results</li>
            <li>Billing and invoicing</li>
          </ul>
          <p style="text-align: center;">
            <a href="${subscriptionUrl}" class="button">Subscribe Now</a>
          </p>
          <p>Choose a plan that fits your needs and continue managing your clinic seamlessly.</p>
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

