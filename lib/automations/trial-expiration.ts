// Trial Expiration Automation
// Handles trial expiration and enforces limitations

import { runWithTenant } from '@/lib/tenant-context';
import { getTenantById, updateTenant, listTenants } from '@/lib/data/tenant';
import { listActiveUsersByRoleNames } from '@/lib/data/user';
import { createNotification } from '@/lib/data/notification';
import { getOrCreateSettings } from '@/lib/data/settings';
import { sendEmail } from '@/lib/email';
import { sendSMS } from '@/lib/sms';

export interface TrialExpirationOptions {
  tenantId: string;
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
    const tenantId = options.tenantId;
    const tenant = await getTenantById(tenantId);

    if (!tenant) {
      return { success: false, handled: false, actions: [], error: 'Tenant not found' };
    }

    // Check if subscription is trial and expired
    if (tenant.subscriptionPlan !== 'trial') {
      return { success: true, handled: false, actions: [] };
    }

    const now = new Date();
    const expiresAt = tenant.subscriptionExpiresAt ? new Date(tenant.subscriptionExpiresAt) : null;

    if (!expiresAt || expiresAt > now) {
      return { success: true, handled: false, actions: [] };
    }

    // Trial has expired
    const actions: string[] = [];

    // 1. Update subscription status
    await updateTenant(tenantId, { subscriptionStatus: 'expired' });
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
async function sendTrialExpirationNotifications(tenant: { id: string; name: string }): Promise<void> {
  try {
    await runWithTenant(tenant.id, async () => {
      const adminUsers = await listActiveUsersByRoleNames(['admin']);

      const settings = await getOrCreateSettings(tenant.id);
      const clinicName = settings?.clinicName || tenant.name || 'Clinic';
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
      const subscriptionUrl = `${baseUrl}/subscription`;

      for (const admin of adminUsers) {
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

        const phone = (admin as any).phone as string | undefined;
        if (phone) {
          try {
            let phoneNumber = phone.trim();
            if (!phoneNumber.startsWith('+')) {
              phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
            }

            const message = `Your ${clinicName} trial period has expired. Please subscribe to continue using the service. Visit ${subscriptionUrl}`;

            await sendSMS({ to: phoneNumber, message });
          } catch (error) {
            console.error(`Error sending trial expiration SMS to ${phone}:`, error);
          }
        }

        try {
          await createNotification({
            userId: admin.id,
            type: 'system',
            priority: 'high',
            title: 'Trial Period Expired',
            message: 'Your trial period has expired. Please subscribe to continue using the service.',
            actionUrl: subscriptionUrl,
          });
        } catch (error) {
          console.error(`Error creating trial expiration notification for ${admin.id}:`, error);
        }
      }
    });
  } catch (error) {
    console.error('Error sending trial expiration notifications:', error);
  }
}

/**
 * Enforce trial limitations (restrict access)
 */
async function enforceTrialLimitations(tenantId: string): Promise<void> {
  try {
    // The actual enforcement happens via middleware and API checks.
    // The subscription status being 'expired' (set above) is enough — the
    // middleware will handle redirects and the API will enforce limits.
    void tenantId;
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
    const now = new Date();
    const expiredTenants = await listTenants({
      subscriptionPlan: 'trial',
      subscriptionStatus: 'active',
      subscriptionExpiresAt: { lte: now },
    });

    const results: Array<{ tenantId: string; success: boolean; error?: string }> = [];
    let expired = 0;
    let errors = 0;

    for (const tenant of expiredTenants) {
      const result = await handleTrialExpiration({
        tenantId: tenant.id,
        sendNotifications: true,
        enforceLimitations: true,
      });

      results.push({
        tenantId: tenant.id,
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
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const expiringTenants = await listTenants({
      subscriptionPlan: 'trial',
      subscriptionStatus: 'active',
      subscriptionExpiresAt: { gte: now, lte: threeDaysFromNow },
    });

    let warningsSent = 0;
    let errors = 0;

    for (const tenant of expiringTenants) {
      try {
        const expiresAt = tenant.subscriptionExpiresAt ? new Date(tenant.subscriptionExpiresAt) : null;
        if (!expiresAt) continue;

        const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        await runWithTenant(tenant.id, async () => {
          const adminUsers = await listActiveUsersByRoleNames(['admin']);

          const settings = await getOrCreateSettings(tenant.id);
          const clinicName = settings?.clinicName || tenant.name || 'Clinic';
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://your-clinic.com';
          const subscriptionUrl = `${baseUrl}/subscription`;

          for (const admin of adminUsers) {
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

            try {
              await createNotification({
                userId: admin.id,
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
        });

        warningsSent++;
      } catch (error) {
        console.error(`Error sending warning for tenant ${tenant.id}:`, error);
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
function generateTrialExpirationEmail(tenant: { name: string }, clinicName: string, subscriptionUrl: string): { subject: string; html: string } {
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
  tenant: { name: string },
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
