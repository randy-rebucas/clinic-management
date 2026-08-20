// Expiry Date Monitoring Automation
// Alerts before medicines expire

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getInventoryItemById, listInventoryExpiringInRange } from '@/lib/data/inventory';
import { listActiveUsersByRoleNames, listActiveUsersFallback } from '@/lib/data/user';
import { getAutomationSettings } from '@/lib/data/settings';
import { createNotification } from '@/lib/data/notification';
import { sendEmail } from '@/lib/email';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export interface ExpiryAlertOptions {
  inventoryId?: string;
  tenantId?: string;
  daysBeforeExpiry?: number;
  sendEmail?: boolean;
  sendNotification?: boolean;
}

/**
 * Send expiry alert for inventory item
 */
export async function sendExpiryAlert(options: ExpiryAlertOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    const tenantId = options.tenantId ?? null;

    const automationSettings = await run(tenantId, () => getAutomationSettings(tenantId));
    if (!automationSettings.autoExpiryMonitoring) {
      return { success: true, sent: false };
    }

    if (!options.inventoryId) {
      return { success: false, sent: false, error: 'Inventory item not found' };
    }

    const inventory = await run(tenantId, () => getInventoryItemById(options.inventoryId!));

    if (!inventory) {
      return { success: false, sent: false, error: 'Inventory item not found' };
    }

    // Check if item has expiry date
    if (!inventory.expiryDate) {
      return { success: true, sent: false };
    }

    const expiryDate = new Date(inventory.expiryDate);
    const today = new Date();
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Only alert if within the specified days before expiry
    const alertDays = options.daysBeforeExpiry || 30;
    if (daysUntilExpiry > alertDays) {
      return { success: true, sent: false };
    }

    // Don't alert if already expired (handled by inventory alerts)
    if (daysUntilExpiry < 0) {
      return { success: true, sent: false };
    }

    // Get admin/accountant users
    let alertRecipients = await run(tenantId, () => listActiveUsersByRoleNames(['admin', 'accountant']));

    if (alertRecipients.length === 0) {
      alertRecipients = (await run(tenantId, () => listActiveUsersFallback(1))) as typeof alertRecipients;
    }

    if (alertRecipients.length === 0) {
      return { success: false, sent: false, error: 'No alert recipients found' };
    }

    const alertMessage = generateExpiryMessage(inventory, daysUntilExpiry);
    const emailContent = generateExpiryEmail(inventory, daysUntilExpiry);

    let sent = false;

    // Send notifications to all recipients
    if (options.sendNotification !== false) {
      for (const user of alertRecipients) {
        try {
          await run(tenantId, () =>
            createNotification({
              userId: user.id,
              type: 'system',
              priority: daysUntilExpiry <= 7 ? 'high' : 'normal',
              title: daysUntilExpiry <= 7 ? 'URGENT: Medicine Expiring Soon' : 'Medicine Expiring Soon',
              message: alertMessage,
              actionUrl: `/inventory/${inventory.id}`,
            })
          );
          sent = true;
        } catch (error) {
          console.error(`Error creating notification for user ${user.id}:`, error);
        }
      }
    }

    // Send email to first recipient (typically admin)
    if (options.sendEmail && alertRecipients.length > 0) {
      const recipient = alertRecipients[0] as any;
      if (recipient.email) {
        try {
          const emailResult = await sendEmail({
            to: recipient.email,
            subject: emailContent.subject,
            html: emailContent.html,
            // CC other recipients
            cc: alertRecipients.slice(1).map((u: any) => u.email).filter(Boolean),
          });

          if (emailResult.success) {
            sent = true;
          }
        } catch (error) {
          console.error('Error sending expiry alert email:', error);
        }
      }
    }

    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending expiry alert:', error);
    return {
      success: false,
      sent: false,
      error: error.message || 'Failed to send expiry alert',
    };
  }
}

/**
 * Process all inventory items and send expiry alerts
 * This should be called by a cron job
 */
export async function processExpiryAlerts(tenantId?: string): Promise<{
  success: boolean;
  processed: number;
  alertsSent: number;
  errors: number;
  results: Array<{ inventoryId: string; daysUntilExpiry: number; success: boolean; error?: string }>;
}> {
  try {
    const resolvedTenantId = tenantId ?? null;

    const automationSettings = await run(resolvedTenantId, () => getAutomationSettings(resolvedTenantId));
    if (!automationSettings.autoExpiryMonitoring) {
      return { success: true, processed: 0, alertsSent: 0, errors: 0, results: [] };
    }

    // Build range for items with expiry dates within 30 days
    const today = new Date();
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    const inventoryItems = await run(resolvedTenantId, () => listInventoryExpiringInRange(today, thirtyDaysFromNow));

    const results: Array<{ inventoryId: string; daysUntilExpiry: number; success: boolean; error?: string }> = [];
    let alertsSent = 0;
    let errors = 0;

    for (const item of inventoryItems) {
      if (!item.expiryDate) continue;

      const expiryDate = new Date(item.expiryDate);
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // Send alerts at 30 days, 7 days, and 1 day before expiry
      const shouldAlert = daysUntilExpiry === 30 || daysUntilExpiry === 7 || daysUntilExpiry === 1;

      if (shouldAlert) {
        const result = await sendExpiryAlert({
          inventoryId: item.id,
          tenantId: resolvedTenantId ?? undefined,
          daysBeforeExpiry: daysUntilExpiry,
          sendEmail: true,
          sendNotification: true,
        });

        results.push({
          inventoryId: item.id,
          daysUntilExpiry,
          success: result.success,
          error: result.error,
        });

        if (result.success && result.sent) {
          alertsSent++;
        } else if (!result.success) {
          errors++;
        }
      }
    }

    return {
      success: true,
      processed: inventoryItems.length,
      alertsSent,
      errors,
      results,
    };
  } catch (error: any) {
    console.error('Error processing expiry alerts:', error);
    return {
      success: false,
      processed: 0,
      alertsSent: 0,
      errors: 1,
      results: [{ inventoryId: 'unknown', daysUntilExpiry: 0, success: false, error: error.message }],
    };
  }
}

/**
 * Generate expiry alert message
 */
function generateExpiryMessage(inventory: any, daysUntilExpiry: number): string {
  const itemName = inventory.name;
  const quantity = inventory.quantity;
  const unit = inventory.unit || 'units';
  const expiryDate = new Date(inventory.expiryDate).toLocaleDateString();

  if (daysUntilExpiry <= 1) {
    return `URGENT: ${itemName} expires ${daysUntilExpiry === 0 ? 'today' : 'tomorrow'} (${expiryDate}). Current stock: ${quantity} ${unit}. Please use or dispose immediately.`;
  } else if (daysUntilExpiry <= 7) {
    return `URGENT: ${itemName} expires in ${daysUntilExpiry} days (${expiryDate}). Current stock: ${quantity} ${unit}. Please prioritize usage.`;
  } else {
    return `${itemName} expires in ${daysUntilExpiry} days (${expiryDate}). Current stock: ${quantity} ${unit}. Please plan usage accordingly.`;
  }
}

/**
 * Generate expiry alert email
 */
function generateExpiryEmail(inventory: any, daysUntilExpiry: number): { subject: string; html: string } {
  const itemName = inventory.name;
  const quantity = inventory.quantity;
  const unit = inventory.unit || 'units';
  const sku = inventory.sku || 'N/A';
  const expiryDate = new Date(inventory.expiryDate).toLocaleDateString();

  let subject = '';
  let urgencyColor = '#ff9800';
  let urgencyText = '';

  if (daysUntilExpiry <= 1) {
    subject = `URGENT: ${itemName} Expires ${daysUntilExpiry === 0 ? 'Today' : 'Tomorrow'}`;
    urgencyColor = '#f44336';
    urgencyText = 'URGENT - EXPIRES SOON';
  } else if (daysUntilExpiry <= 7) {
    subject = `URGENT: ${itemName} Expires in ${daysUntilExpiry} Days`;
    urgencyColor = '#ff5722';
    urgencyText = 'EXPIRING SOON';
  } else {
    subject = `${itemName} Expires in ${daysUntilExpiry} Days`;
    urgencyColor = '#ff9800';
    urgencyText = 'EXPIRY NOTICE';
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: ${urgencyColor}; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .info-box { background-color: white; padding: 15px; margin: 10px 0; border-left: 4px solid ${urgencyColor}; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        .days { font-size: 1.5em; font-weight: bold; color: ${urgencyColor}; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${urgencyText}</h1>
        </div>
        <div class="content">
          <p>Expiry Alert</p>
          <div class="info-box">
            <p><strong>Item Name:</strong> ${itemName}</p>
            <p><strong>SKU:</strong> ${sku}</p>
            <p><strong>Current Quantity:</strong> ${quantity} ${unit}</p>
            <p><strong>Expiry Date:</strong> ${expiryDate}</p>
            <p class="days">Days Until Expiry: ${daysUntilExpiry}</p>
          </div>
          ${daysUntilExpiry <= 1
            ? '<p><strong>This item expires very soon. Please use or dispose immediately.</strong></p>'
            : daysUntilExpiry <= 7
            ? '<p><strong>This item is expiring soon. Please prioritize usage to avoid waste.</strong></p>'
            : '<p>Please plan usage of this item to ensure it is used before expiry.</p>'
          }
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
