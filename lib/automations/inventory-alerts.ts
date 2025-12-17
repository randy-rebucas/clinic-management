// Inventory Alert Automation
// Sends alerts when inventory is low or expired

import connectDB from '@/lib/mongodb';
import Inventory from '@/models/Inventory';
import User from '@/models/User';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { Types } from 'mongoose';

export interface InventoryAlertOptions {
  inventoryId?: string | Types.ObjectId;
  tenantId?: string | Types.ObjectId;
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
    await connectDB();

    const settings = await getSettings();
    const autoLowStockAlerts = (settings.automationSettings as any)?.autoLowStockAlerts !== false;

    if (!autoLowStockAlerts) {
      return { success: true, sent: false };
    }

    // Get inventory item
    const inventoryQuery: any = {};
    if (options.inventoryId) {
      inventoryQuery._id = typeof options.inventoryId === 'string' 
        ? new Types.ObjectId(options.inventoryId) 
        : options.inventoryId;
    }
    if (options.tenantId) {
      inventoryQuery.tenantId = typeof options.tenantId === 'string' 
        ? new Types.ObjectId(options.tenantId) 
        : options.tenantId;
    }

    const inventory = await Inventory.findOne(inventoryQuery);

    if (!inventory) {
      return { success: false, error: 'Inventory item not found' };
    }

    // Check if alert is appropriate
    if (options.alertType === 'low-stock' && inventory.status !== 'low-stock') {
      return { success: true, sent: false };
    }
    if (options.alertType === 'out-of-stock' && inventory.status !== 'out-of-stock') {
      return { success: true, sent: false };
    }

    // Get users with inventory management permissions (admin, accountant, or custom role)
    const tenantId = options.tenantId 
      ? (typeof options.tenantId === 'string' ? new Types.ObjectId(options.tenantId) : options.tenantId)
      : inventory.tenantId;

    const usersQuery: any = {};
    if (tenantId) {
      usersQuery.tenantId = tenantId;
    }

    // Get admin and accountant users
    const users = await User.find(usersQuery)
      .populate('role')
      .exec();

    const alertRecipients = users.filter((user: any) => {
      const role = user.role;
      if (!role) return false;
      // Admin and accountant typically have inventory access
      return role.name === 'admin' || role.name === 'accountant';
    });

    if (alertRecipients.length === 0) {
      // Fallback: get any admin user
      const adminUser = await User.findOne({ ...usersQuery, role: { $exists: true } })
        .populate('role')
        .exec();
      if (adminUser) {
        alertRecipients.push(adminUser);
      }
    }

    if (alertRecipients.length === 0) {
      return { success: false, error: 'No alert recipients found' };
    }

    const alertMessage = generateAlertMessage(inventory, options.alertType);
    const emailContent = generateAlertEmail(inventory, options.alertType);

    let sent = false;

    // Send notifications to all recipients
    if (options.sendNotification !== false) {
      for (const user of alertRecipients) {
        try {
          await createNotification({
            userId: user._id,
            tenantId,
            type: 'system',
            priority: options.alertType === 'expired' || options.alertType === 'out-of-stock' ? 'high' : 'normal',
            title: getAlertTitle(options.alertType),
            message: alertMessage,
            relatedEntity: {
              type: 'invoice', // Using invoice type as placeholder - you might want to add 'inventory' type
              id: inventory._id,
            },
            actionUrl: `/inventory/${inventory._id}`,
          });
          sent = true;
        } catch (error) {
          console.error(`Error creating notification for user ${user._id}:`, error);
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
  } catch (error: any) {
    console.error('Error sending inventory alert:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to send inventory alert' 
    };
  }
}

/**
 * Process all inventory items and send alerts for low stock/expired items
 * This should be called by a cron job
 */
export async function processInventoryAlerts(tenantId?: string | Types.ObjectId): Promise<{
  success: boolean;
  processed: number;
  alertsSent: number;
  errors: number;
  results: Array<{ inventoryId: string; type: string; success: boolean; error?: string }>;
}> {
  try {
    await connectDB();

    const settings = await getSettings();
    const autoLowStockAlerts = (settings.automationSettings as any)?.autoLowStockAlerts !== false;

    if (!autoLowStockAlerts) {
      return { success: true, processed: 0, alertsSent: 0, errors: 0, results: [] };
    }

    // Build query
    const query: any = {
      status: { $in: ['low-stock', 'out-of-stock', 'expired'] },
    };

    if (tenantId) {
      query.tenantId = typeof tenantId === 'string' 
        ? new Types.ObjectId(tenantId) 
        : tenantId;
    }

    // Get all inventory items that need alerts
    const inventoryItems = await Inventory.find(query);

    const results: Array<{ inventoryId: string; type: string; success: boolean; error?: string }> = [];
    let alertsSent = 0;
    let errors = 0;

    for (const item of inventoryItems) {
      let alertType: 'low-stock' | 'out-of-stock' | 'expired' = 'low-stock';
      
      if (item.status === 'expired') {
        alertType = 'expired';
      } else if (item.status === 'out-of-stock') {
        alertType = 'out-of-stock';
      } else {
        alertType = 'low-stock';
      }

      const result = await sendLowStockAlert({
        inventoryId: item._id,
        tenantId: item.tenantId,
        alertType,
        sendEmail: true,
        sendNotification: true,
      });

      results.push({
        inventoryId: item._id.toString(),
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

