// Inventory Alert Automation
// Sends alerts when inventory is low or expired

import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getInventoryItemById, listInventoryItems, buildInventoryWhere } from '@/lib/data/inventory';
import { listUsers } from '@/lib/data/user';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';

function run<T>(tenantId: any, fn: () => T | Promise<T>): T | Promise<T> {
  const tid = tenantId ? String(tenantId) : null;
  return tid ? runWithTenant(tid, fn) : runAsSystem(fn);
}

export interface InventoryAlertOptions {
  inventoryId?: string;
  tenantId?: any;
  alertType: 'low-stock' | 'out-of-stock' | 'expiring-soon' | 'expired';
  sendEmail?: boolean;
  sendNotification?: boolean;
}

/**
 * Send alert for low stock inventory item
 */
export async function sendLowStockAlert(options: InventoryAlertOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    return await run(options.tenantId, async () => {
      const settings = await getSettings();
      const autoLowStockAlerts = (settings.automationSettings as any)?.autoLowStockAlerts !== false;

      if (!autoLowStockAlerts) {
        return { success: true, sent: false };
      }

      if (!options.inventoryId) {
        return { success: false, sent: false, error: 'Inventory item not found' };
      }

      const inventory = await getInventoryItemById(options.inventoryId);

      if (!inventory) {
        return { success: false, sent: false, error: 'Inventory item not found' };
      }

      // Check if alert is appropriate
      if (options.alertType === 'low-stock' && (inventory as any).status !== 'low-stock') {
        return { success: true, sent: false };
      }
      if (options.alertType === 'out-of-stock' && (inventory as any).status !== 'out-of-stock') {
        return { success: true, sent: false };
      }

      // Get admin and accountant users
      const users = await listUsers();

      const alertRecipients = users.filter((user: any) => {
        const role = user.role;
        if (!role) return false;
        // Admin and accountant typically have inventory access
        return role.name === 'admin' || role.name === 'accountant';
      });

      if (alertRecipients.length === 0 && users.length > 0) {
        // Fallback: get any user with a role
        alertRecipients.push(users[0] as any);
      }

      if (alertRecipients.length === 0) {
        return { success: false, sent: false, error: 'No alert recipients found' };
      }

      const alertMessage = generateAlertMessage(inventory, options.alertType);
      const emailContent = generateAlertEmail(inventory, options.alertType);

      let sent = false;

      // Send notifications to all recipients
      if (options.sendNotification !== false) {
        for (const user of alertRecipients) {
          try {
            await createNotification({
              userId: (user as any).id,
              tenantId: options.tenantId ? String(options.tenantId) : (inventory as any).tenantId,
              type: 'system',
              priority: options.alertType === 'expired' || options.alertType === 'out-of-stock' ? 'high' : 'normal',
              title: getAlertTitle(options.alertType),
              message: alertMessage,
              relatedEntity: {
                type: 'invoice', // Using invoice type as placeholder - you might want to add 'inventory' type
                id: (inventory as any).id,
              },
              actionUrl: `/inventory/${(inventory as any).id}`,
            });
            sent = true;
          } catch (error) {
            console.error(`Error creating notification for user ${(user as any).id}:`, error);
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
            console.error('Error sending inventory alert email:', error);
          }
        }
      }

      return { success: true, sent };
    });
  } catch (error: any) {
    console.error('Error sending inventory alert:', error);
    return {
      success: false,
      sent: false,
      error: error.message || 'Failed to send inventory alert'
    };
  }
}

/**
 * Process all inventory items and send alerts for low stock/expired items
 * This should be called by a cron job
 */
export async function processInventoryAlerts(tenantId?: any): Promise<{
  success: boolean;
  processed: number;
  alertsSent: number;
  errors: number;
  results: Array<{ inventoryId: string; type: string; success: boolean; error?: string }>;
}> {
  try {
    return await run(tenantId, async () => {
      const settings = await getSettings();
      const autoLowStockAlerts = (settings.automationSettings as any)?.autoLowStockAlerts !== false;

      if (!autoLowStockAlerts) {
        return { success: true, processed: 0, alertsSent: 0, errors: 0, results: [] };
      }

      // Get all inventory items that need alerts
      const inventoryItems = await listInventoryItems(
        buildInventoryWhere({ status: ['low-stock', 'out-of-stock', 'expired'] })
      );

      const results: Array<{ inventoryId: string; type: string; success: boolean; error?: string }> = [];
      let alertsSent = 0;
      let errors = 0;

      for (const item of inventoryItems) {
        let alertType: 'low-stock' | 'out-of-stock' | 'expired' = 'low-stock';

        if ((item as any).status === 'expired') {
          alertType = 'expired';
        } else if ((item as any).status === 'out-of-stock') {
          alertType = 'out-of-stock';
        } else {
          alertType = 'low-stock';
        }

        const result = await sendLowStockAlert({
          inventoryId: (item as any).id,
          tenantId: (item as any).tenantId,
          alertType,
          sendEmail: true,
          sendNotification: true,
        });

        results.push({
          inventoryId: (item as any).id,
          type: alertType,
          success: result.success,
          error: result.error,
        });

        if (result.success && result.sent) {
          alertsSent++;
        } else if (!result.success) {
          errors++;
        }
      }

      return {
        success: true,
        processed: inventoryItems.length,
        alertsSent,
        errors,
        results,
      };
    });
  } catch (error: any) {
    console.error('Error processing inventory alerts:', error);
    return {
      success: false,
      processed: 0,
      alertsSent: 0,
      errors: 1,
      results: [{ inventoryId: 'unknown', type: 'unknown', success: false, error: error.message }],
    };
  }
}

/**
 * Generate alert message
 */
function generateAlertMessage(inventory: any, alertType: string): string {
  const itemName = inventory.name;
  const quantity = inventory.quantity;
  const unit = inventory.unit || 'units';
  const reorderLevel = inventory.reorderLevel || 0;
  const reorderQuantity = inventory.reorderQuantity || 0;

  if (alertType === 'expired') {
    return `ALERT: ${itemName} has expired. Please remove from inventory.`;
  } else if (alertType === 'out-of-stock') {
    return `URGENT: ${itemName} is out of stock. Please reorder immediately.`;
  } else {
    return `${itemName} is running low. Current stock: ${quantity} ${unit}. Reorder level: ${reorderLevel} ${unit}. Suggested reorder quantity: ${reorderQuantity} ${unit}.`;
  }
}

/**
 * Generate alert email
 */
function generateAlertEmail(inventory: any, alertType: string): { subject: string; html: string } {
  const itemName = inventory.name;
  const quantity = inventory.quantity;
  const unit = inventory.unit || 'units';
  const reorderLevel = inventory.reorderLevel || 0;
  const reorderQuantity = inventory.reorderQuantity || 0;
  const sku = inventory.sku || 'N/A';
  const supplier = inventory.supplier || 'N/A';
  const expiryDate = inventory.expiryDate
    ? new Date(inventory.expiryDate).toLocaleDateString()
    : 'N/A';

  let subject = '';
  let urgencyColor = '#ff9800';
  let urgencyText = '';

  if (alertType === 'expired') {
    subject = `URGENT: Expired Inventory Item - ${itemName}`;
    urgencyColor = '#f44336';
    urgencyText = 'EXPIRED';
  } else if (alertType === 'out-of-stock') {
    subject = `URGENT: Out of Stock - ${itemName}`;
    urgencyColor = '#f44336';
    urgencyText = 'OUT OF STOCK';
  } else {
    subject = `Low Stock Alert - ${itemName}`;
    urgencyColor = '#ff9800';
    urgencyText = 'LOW STOCK';
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
        .quantity { font-size: 1.5em; font-weight: bold; color: ${urgencyColor}; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${urgencyText}</h1>
        </div>
        <div class="content">
          <p>Inventory Alert</p>
          <div class="info-box">
            <p><strong>Item Name:</strong> ${itemName}</p>
            <p><strong>SKU:</strong> ${sku}</p>
            <p><strong>Current Quantity:</strong> <span class="quantity">${quantity} ${unit}</span></p>
            <p><strong>Reorder Level:</strong> ${reorderLevel} ${unit}</p>
            <p><strong>Suggested Reorder Quantity:</strong> ${reorderQuantity} ${unit}</p>
            <p><strong>Supplier:</strong> ${supplier}</p>
            ${alertType === 'expired' ? `<p><strong>Expiry Date:</strong> ${expiryDate}</p>` : ''}
          </div>
          ${alertType === 'expired'
            ? '<p><strong>This item has expired. Please remove it from inventory immediately.</strong></p>'
            : alertType === 'out-of-stock'
            ? '<p><strong>This item is out of stock. Please reorder immediately.</strong></p>'
            : '<p>Please consider reordering this item to maintain adequate stock levels.</p>'
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

/**
 * Get alert title
 */
function getAlertTitle(alertType: string): string {
  if (alertType === 'expired') {
    return 'Expired Inventory Item';
  } else if (alertType === 'out-of-stock') {
    return 'Out of Stock Alert';
  } else {
    return 'Low Stock Alert';
  }
}
