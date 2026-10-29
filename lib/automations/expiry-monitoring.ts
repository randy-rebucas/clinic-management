// Expiry Date Monitoring Automation
// Alerts before medicines expire

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
  pendingThreshold,
  daysUntilInTz,
  displayDate,
  errorMessage,
  BATCH_LIMIT,
  type AutomationTenant,
} from './shared';

export interface ExpiryAlertOptions {
  inventoryId?: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
  daysBeforeExpiry?: number;
  sendEmail?: boolean;
  sendNotification?: boolean;
}

const EXPIRY_THRESHOLDS = [30, 7, 1];

/**
 * Send expiry alert for inventory item
 */
export async function sendExpiryAlert(options: ExpiryAlertOptions): Promise<{
  success: boolean;
  sent: boolean;
  error?: string;
}> {
  try {
    await connectDB();

    if (!options.tenantId || !options.inventoryId) {
      return { success: false, sent: false, error: 'Tenant and inventory item are required' };
    }
    const tenantId = new Types.ObjectId(String(options.tenantId));

    const settings = await getSettings(tenantId.toString());
    if (!automationEnabled(settings, 'autoExpiryMonitoring')) {
      return { success: true, sent: false };
    }

    const inventory = await Inventory.findOne({ _id: options.inventoryId, tenantId });
    if (!inventory) {
      return { success: false, sent: false, error: 'Inventory item not found' };
    }
    if (!inventory.expiryDate) {
      return { success: true, sent: false };
    }

    const tz = await getTenantTimezone(tenantId);
    const daysUntilExpiry = daysUntilInTz(inventory.expiryDate, tz);

    const alertDays = options.daysBeforeExpiry || 30;
    if (daysUntilExpiry > alertDays || daysUntilExpiry < 0) {
      return { success: true, sent: false };
    }

    const alertRecipients = await getTenantStaff(tenantId, ['admin', 'accountant']);
    if (alertRecipients.length === 0) {
      return { success: false, sent: false, error: 'No alert recipients found' };
    }

    const alertMessage = generateExpiryMessage(inventory, daysUntilExpiry, tz);
    const emailContent = generateExpiryEmail(inventory, daysUntilExpiry, tz);

    let sent = false;

    if (options.sendNotification !== false) {
      for (const user of alertRecipients) {
        const ok = await safeNotify({
          userId: user._id,
          tenantId,
          type: 'system',
          priority: daysUntilExpiry <= 7 ? 'high' : 'normal',
          title: daysUntilExpiry <= 7 ? 'URGENT: Medicine Expiring Soon' : 'Medicine Expiring Soon',
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
      error: 'Failed to send expiry alert',
    };
  }
}

type ExpiryResult = {
  success: boolean;
  processed: number;
  alertsSent: number;
  errors: number;
  results: Array<{ inventoryId: string; daysUntilExpiry: number; success: boolean; error?: string }>;
};

async function processTenant(tenant: AutomationTenant): Promise<ExpiryResult> {
  const out: ExpiryResult = { success: true, processed: 0, alertsSent: 0, errors: 0, results: [] };

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoExpiryMonitoring')) return out;

  const now = new Date();
  const horizon = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000);

  const items = await Inventory.find({
    tenantId: tenant.tenantObjectId,
    expiryDate: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000), $lte: horizon },
    status: { $ne: 'expired' },
  })
    .select('_id expiryDate expiryAlertsSent expiryAlertsFor')
    .sort({ expiryDate: 1 })
    .limit(BATCH_LIMIT)
    .lean();

  for (const item of items as any[]) {
    out.processed++;
    try {
      const daysUntilExpiry = daysUntilInTz(item.expiryDate, tenant.timezone, now);
      if (daysUntilExpiry < 0) continue;

      // Markers only count for the expiry date they were recorded against (a restock resets them).
      const sameExpiry = item.expiryAlertsFor && new Date(item.expiryAlertsFor).getTime() === new Date(item.expiryDate).getTime();
      const due = pendingThreshold(daysUntilExpiry, EXPIRY_THRESHOLDS, sameExpiry ? item.expiryAlertsSent : []);
      if (!due) continue;

      const result = await sendExpiryAlert({
        inventoryId: item._id,
        tenantId: tenant.tenantObjectId,
        daysBeforeExpiry: due.level,
        sendEmail: true,
        sendNotification: true,
      });

      out.results.push({ inventoryId: String(item._id), daysUntilExpiry, success: result.success, error: result.error });

      if (result.success && result.sent) {
        out.alertsSent++;
        const sentLevels = Array.from(new Set([...(sameExpiry ? item.expiryAlertsSent || [] : []), ...due.crossed]));
        await Inventory.updateOne(
          { _id: item._id, tenantId: tenant.tenantObjectId },
          { $set: { expiryAlertsSent: sentLevels, expiryAlertsFor: item.expiryDate } }
        );
      } else if (!result.success) {
        out.errors++;
      }
    } catch (error) {
      out.errors++;
      out.results.push({ inventoryId: String(item._id), daysUntilExpiry: 0, success: false, error: errorMessage(error) });
    }
  }

  return out;
}

/**
 * Process all inventory items and send expiry alerts.
 * Without a tenantId every active tenant is processed.
 */
export async function processExpiryAlerts(tenantId?: string | Types.ObjectId): Promise<ExpiryResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant, { setting: 'autoExpiryMonitoring' });
    const total: ExpiryResult = { success: runs.every((r) => r.success), processed: 0, alertsSent: 0, errors: 0, results: [] };
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
    console.error('Error processing expiry alerts:', error);
    return {
      success: false,
      processed: 0,
      alertsSent: 0,
      errors: 1,
      results: [],
    };
  }
}

function generateExpiryMessage(inventory: any, daysUntilExpiry: number, tz: string): string {
  const itemName = inventory.name;
  const quantity = inventory.quantity;
  const unit = inventory.unit || 'units';
  const expiryDate = displayDate(inventory.expiryDate, tz);

  if (daysUntilExpiry <= 1) {
    return `URGENT: ${itemName} expires ${daysUntilExpiry === 0 ? 'today' : 'tomorrow'} (${expiryDate}). Current stock: ${quantity} ${unit}. Please use or dispose immediately.`;
  } else if (daysUntilExpiry <= 7) {
    return `URGENT: ${itemName} expires in ${daysUntilExpiry} days (${expiryDate}). Current stock: ${quantity} ${unit}. Please prioritize usage.`;
  } else {
    return `${itemName} expires in ${daysUntilExpiry} days (${expiryDate}). Current stock: ${quantity} ${unit}. Please plan usage accordingly.`;
  }
}

function generateExpiryEmail(inventory: any, daysUntilExpiry: number, tz: string): { subject: string; html: string } {
  const itemName = inventory.name;
  const quantity = inventory.quantity;
  const unit = inventory.unit || 'units';
  const sku = inventory.sku || 'N/A';
  const expiryDate = displayDate(inventory.expiryDate, tz);

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
            <p><strong>Item Name:</strong> ${escapeHtml(itemName)}</p>
            <p><strong>SKU:</strong> ${escapeHtml(sku)}</p>
            <p><strong>Current Quantity:</strong> ${escapeHtml(quantity)} ${escapeHtml(unit)}</p>
            <p><strong>Expiry Date:</strong> ${escapeHtml(expiryDate)}</p>
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
