// Inventory Alert Automation
// Sends alerts when inventory is low or expired

import connectDB from '@/lib/mongodb';
import Inventory from '@/models/Inventory';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { Types } from 'mongoose';
import {
  forEachTenant,
  automationEnabled,
  getTenantStaff,
  getTenantTimezone,
  safeNotify,
  delivered,
  displayDate,
  errorMessage,
  BATCH_LIMIT,
  type AutomationTenant,
} from './shared';

export interface InventoryAlertOptions {
  inventoryId?: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  alertType: 'low-stock' | 'out-of-stock' | 'expiring-soon' | 'expired';
  sendEmail?: boolean;
  sendNotification?: boolean;
}

/**
 * Send alert for low stock inventory item. Records `stockAlertStatus` so the daily
 * job doesn't repeat an alert for the same state.
 */
export async function sendLowStockAlert(options: InventoryAlertOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    await connectDB();

    // Items without a tenant would otherwise alert every clinic's admins.
    if (!options.tenantId || !options.inventoryId) {
      return { success: true, sent: false };
    }
    const tenantId = new Types.ObjectId(String(options.tenantId));

    const settings = await getSettings(tenantId.toString());
    if (!automationEnabled(settings, 'autoLowStockAlerts')) {
      return { success: true, sent: false };
    }

    const inventory = await Inventory.findOne({ _id: options.inventoryId, tenantId });
    if (!inventory) {
      return { success: false, sent: false, error: 'Inventory item not found' };
    }

    if (options.alertType === 'low-stock' && inventory.status !== 'low-stock') {
      return { success: true, sent: false };
    }
    if (options.alertType === 'out-of-stock' && inventory.status !== 'out-of-stock') {
      return { success: true, sent: false };
    }

    const alertRecipients = await getTenantStaff(tenantId, ['admin', 'accountant']);
    if (alertRecipients.length === 0) {
      return { success: false, sent: false, error: 'No alert recipients found' };
    }

    const tz = await getTenantTimezone(tenantId);
    const alertMessage = generateAlertMessage(inventory, options.alertType);
    const emailContent = generateAlertEmail(inventory, options.alertType, tz);

    let sent = false;

    if (options.sendNotification !== false) {
      for (const user of alertRecipients) {
        const ok = await safeNotify({
          userId: user._id,
          tenantId,
          type: 'system',
          priority: options.alertType === 'expired' || options.alertType === 'out-of-stock' ? 'high' : 'normal',
          title: getAlertTitle(options.alertType),
          message: alertMessage,
          actionUrl: `/inventory/${inventory._id}`,
        });
        if (ok) sent = true;
      }
    }

    if (options.sendEmail) {
      const emails = alertRecipients.map((u: any) => u.email).filter(Boolean);
      if (emails.length > 0) {
        try {
          const emailResult = await sendEmail({
            to: emails[0],
            subject: emailContent.subject,
            html: emailContent.html,
            cc: emails.slice(1),
          });
          if (delivered(emailResult)) sent = true;
        } catch (error) {
          console.error('Error sending inventory alert email:', error);
        }
      }
    }

    if (sent) {
      await Inventory.updateOne({ _id: inventory._id, tenantId }, { $set: { stockAlertStatus: inventory.status } });
    }

    return { success: true, sent };
  } catch (error: any) {
    console.error('Error sending inventory alert:', error);
    return {
      success: false,
      sent: false,
      error: 'Failed to send inventory alert',
    };
  }
}

type AlertsResult = {
  success: boolean;
  processed: number;
  alertsSent: number;
  errors: number;
  results: Array<{ inventoryId: string; type: string; success: boolean; error?: string }>;
};

async function processTenant(tenant: AutomationTenant): Promise<AlertsResult> {
  const out: AlertsResult = { success: true, processed: 0, alertsSent: 0, errors: 0, results: [] };

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoLowStockAlerts')) return out;

  // Only items whose current alert state hasn't been reported yet.
  const items = await Inventory.find({
    tenantId: tenant.tenantObjectId,
    status: { $in: ['low-stock', 'out-of-stock', 'expired'] },
    $expr: { $ne: [{ $ifNull: ['$stockAlertStatus', ''] }, '$status'] },
  })
    .select('_id status')
    .limit(BATCH_LIMIT)
    .lean();

  for (const item of items as any[]) {
    out.processed++;
    const alertType = item.status as 'low-stock' | 'out-of-stock' | 'expired';
    try {
      const result = await sendLowStockAlert({
        inventoryId: item._id,
        tenantId: tenant.tenantObjectId,
        alertType,
        sendEmail: true,
        sendNotification: true,
      });
      out.results.push({ inventoryId: String(item._id), type: alertType, success: result.success, error: result.error });
      if (result.success && result.sent) out.alertsSent++;
      else if (!result.success) out.errors++;
    } catch (error) {
      out.errors++;
      out.results.push({ inventoryId: String(item._id), type: alertType, success: false, error: errorMessage(error) });
    }
  }

  return out;
}

/**
 * Process inventory items and send alerts for low stock/expired items.
 * Without a tenantId every active tenant is processed.
 */
export async function processInventoryAlerts(tenantId?: string | Types.ObjectId): Promise<AlertsResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant);
    const total: AlertsResult = { success: runs.every((r) => r.success), processed: 0, alertsSent: 0, errors: 0, results: [] };
    for (const run of runs) {
      if (!run.result) {
        total.errors++;
        continue;
      }
      total.processed += run.result.processed;
      total.alertsSent += run.result.alertsSent;
      total.errors += run.result.errors;
      total.results.push(...run.result.results);
    }
    return total;
  } catch (error: any) {
    console.error('Error processing inventory alerts:', error);
    return {
      success: false,
      processed: 0,
      alertsSent: 0,
      errors: 1,
      results: [],
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
function generateAlertEmail(inventory: any, alertType: string, tz: string): { subject: string; html: string } {
  const subjectName = inventory.name;
  const itemName = escapeHtml(inventory.name);
  const quantity = escapeHtml(inventory.quantity);
  const unit = escapeHtml(inventory.unit || 'units');
  const reorderLevel = escapeHtml(inventory.reorderLevel || 0);
  const reorderQuantity = escapeHtml(inventory.reorderQuantity || 0);
  const sku = escapeHtml(inventory.sku || 'N/A');
  const supplier = escapeHtml(inventory.supplier || 'N/A');
  const expiryDate = inventory.expiryDate ? escapeHtml(displayDate(inventory.expiryDate, tz)) : 'N/A';

  let subject = '';
  let urgencyColor = '#ff9800';
  let urgencyText = '';

  if (alertType === 'expired') {
    subject = `URGENT: Expired Inventory Item - ${subjectName}`;
    urgencyColor = '#f44336';
    urgencyText = 'EXPIRED';
  } else if (alertType === 'out-of-stock') {
    subject = `URGENT: Out of Stock - ${subjectName}`;
    urgencyColor = '#f44336';
    urgencyText = 'OUT OF STOCK';
  } else {
    subject = `Low Stock Alert - ${subjectName}`;
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

