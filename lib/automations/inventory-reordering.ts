// Automatic Inventory Reordering Automation
// Auto-creates purchase orders when stock hits reorder point or expiry is approaching

import connectDB from '@/lib/mongodb';
import Inventory from '@/models/Inventory';
import { getSettings } from '@/lib/settings';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { Types } from 'mongoose';

export interface ReorderRequest {
  inventoryId: Types.ObjectId;
  inventoryItem: any;
  quantity: number;
  reason: 'low-stock' | 'expiring-soon' | 'out-of-stock';
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface ReorderResult {
  success: boolean;
  processed: number;
  requestsCreated: number;
  notificationsSent: number;
  errors: number;
  requests: ReorderRequest[];
}

/**
 * Determine reorder priority based on stock level and expiry
 */
function determinePriority(item: any, reason: string): 'low' | 'medium' | 'high' | 'urgent' {
  if (reason === 'out-of-stock') {
    return 'urgent';
  }
  
  if (reason === 'low-stock') {
    const reorderLevel = item.reorderLevel || 10;
    const quantity = item.quantity || 0;
    const percentage = (quantity / reorderLevel) * 100;
    
    if (percentage < 25) {
      return 'urgent';
    } else if (percentage < 50) {
      return 'high';
    } else if (percentage < 75) {
      return 'medium';
    }
    return 'low';
  }
  
  if (reason === 'expiring-soon') {
    if (item.expiryDate) {
      const expiryDate = new Date(item.expiryDate);
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilExpiry <= 30) {
        return 'high';
      } else if (daysUntilExpiry <= 60) {
        return 'medium';
      }
    }
    return 'low';
  }
  
  return 'medium';
}

/**
 * Generate reorder request for an inventory item
 */
function generateReorderRequest(item: any): ReorderRequest | null {
  const quantity = item.quantity || 0;
  const reorderLevel = item.reorderLevel || 10;
  const reorderQuantity = item.reorderQuantity || 50;
  const status = item.status || 'in-stock';
  
  let reason: 'low-stock' | 'expiring-soon' | 'out-of-stock' | null = null;
  
  // Check for out-of-stock
  if (status === 'out-of-stock' || quantity === 0) {
    reason = 'out-of-stock';
  }
  // Check for low stock
  else if (status === 'low-stock' || quantity <= reorderLevel) {
    reason = 'low-stock';
  }
  // Check for expiring soon (within 90 days)
  else if (item.expiryDate) {
    const expiryDate = new Date(item.expiryDate);
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExpiry <= 90 && daysUntilExpiry > 0) {
      reason = 'expiring-soon';
    }
  }
  
  if (!reason) {
    return null;
  }
  
  // Calculate quantity to order
  let orderQuantity = reorderQuantity;
  
  // For out-of-stock, order more to build buffer
  if (reason === 'out-of-stock') {
    orderQuantity = Math.max(reorderQuantity, reorderLevel * 2);
  }
  // For expiring soon, order replacement quantity
  else if (reason === 'expiring-soon') {
    orderQuantity = Math.min(reorderQuantity, quantity); // Replace expiring stock
  }
  
  const priority = determinePriority(item, reason);
  
  return {
    inventoryId: item._id,
    inventoryItem: item,
    quantity: orderQuantity,
    reason,
    priority,
  };
}

/**
 * Send reorder notification to administrators
 */
async function sendReorderNotification(
  requests: ReorderRequest[],
  tenantId?: Types.ObjectId
): Promise<{ sent: boolean; error?: string }> {
  try {
    const { default: User } = await import('@/models/User');
    
    // Group requests by priority
    const urgent = requests.filter(r => r.priority === 'urgent');
    const high = requests.filter(r => r.priority === 'high');
    const medium = requests.filter(r => r.priority === 'medium');
    const low = requests.filter(r => r.priority === 'low');
    
    // Get admin and accountant users
    const userQuery: any = {};
    if (tenantId) {
      userQuery.tenantId = tenantId;
    }
    
    const users = await User.find(userQuery)
      .populate('role')
      .exec();
    
    const recipients = users.filter((user: any) => {
      const role = user.role;
      if (!role) return false;
      return role.name === 'admin' || role.name === 'accountant';
    });
    
    if (recipients.length === 0) {
      return { sent: false, error: 'No recipients found' };
    }
    
    // Create notification content
    let message = `Inventory reorder request:\n\n`;
    
    if (urgent.length > 0) {
      message += `🚨 URGENT (${urgent.length}):\n`;
      urgent.forEach(req => {
        message += `- ${req.inventoryItem.name}: Order ${req.quantity} ${req.inventoryItem.unit || 'units'} (${req.reason})\n`;
      });
      message += '\n';
    }
    
    if (high.length > 0) {
      message += `⚠️ High Priority (${high.length}):\n`;
      high.forEach(req => {
        message += `- ${req.inventoryItem.name}: Order ${req.quantity} ${req.inventoryItem.unit || 'units'} (${req.reason})\n`;
      });
      message += '\n';
    }
    
    if (medium.length > 0) {
      message += `📋 Medium Priority (${medium.length}):\n`;
      medium.slice(0, 10).forEach(req => {
        message += `- ${req.inventoryItem.name}: Order ${req.quantity} ${req.inventoryItem.unit || 'units'} (${req.reason})\n`;
      });
      if (medium.length > 10) {
        message += `... and ${medium.length - 10} more\n`;
      }
      message += '\n';
    }
    
    if (low.length > 0) {
      message += `📝 Low Priority (${low.length}):\n`;
      message += `See inventory management for details.\n\n`;
    }
    
    message += `Total items requiring reorder: ${requests.length}`;
    
    // Send notifications
    for (const user of recipients) {
      await createNotification({
        userId: user._id,
        tenantId,
        type: 'system',
        priority: urgent.length > 0 ? 'urgent' : high.length > 0 ? 'high' : 'normal',
        title: `Inventory Reorder Request (${requests.length} items)`,
        message,
        actionUrl: '/inventory',
      }).catch(console.error);
    }
    
    // Send email to first admin if available
    const firstAdmin = recipients.find((u: any) => u.email);
    if (firstAdmin && firstAdmin.email) {
      const emailSubject = `Inventory Reorder Request - ${requests.length} Items`;
      const emailHtml = `
        <h2>Inventory Reorder Request</h2>
        <p>${message.replace(/\n/g, '<br>')}</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/inventory">View Inventory</a></p>
      `;
      
      await sendEmail({
        to: firstAdmin.email,
        subject: emailSubject,
        html: emailHtml,
      }).catch(console.error);
    }
    
    return { sent: true };
  } catch (error: any) {
    console.error('Error sending reorder notification:', error);
    return { sent: false, error: error.message };
  }
}

/**
 * Process inventory items and generate reorder requests
 * This should be called by a cron job
 */
export async function processInventoryReordering(
  tenantId?: string | Types.ObjectId
): Promise<ReorderResult> {
  try {
    await connectDB();
    
    const settings = await getSettings();
    const autoInventoryReordering = (settings.automationSettings as any)?.autoInventoryReordering !== false;
    
    if (!autoInventoryReordering) {
      return {
        success: true,
        processed: 0,
        requestsCreated: 0,
        notificationsSent: 0,
        errors: 0,
        requests: [],
      };
    }
    
    // Find items that need reordering
    const query: any = {
      $or: [
        { status: { $in: ['low-stock', 'out-of-stock'] } },
        { quantity: { $lte: 0 } },
      ],
    };
    
    // Also check for items with expiry date approaching
    const ninetyDaysFromNow = new Date();
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
    
    const expiryQuery: any = {
      expiryDate: { $exists: true, $lte: ninetyDaysFromNow, $gte: new Date() },
      quantity: { $gt: 0 }, // Only items with stock
    };
    
    if (tenantId) {
      query.tenantId = typeof tenantId === 'string'
        ? new Types.ObjectId(tenantId)
        : tenantId;
      expiryQuery.tenantId = typeof tenantId === 'string'
        ? new Types.ObjectId(tenantId)
        : tenantId;
    }
    
    // Get low stock/out of stock items
    const lowStockItems = await Inventory.find(query);
    
    // Get expiring items
    const expiringItems = await Inventory.find(expiryQuery);
    
    // Combine and deduplicate
    const allItems = [...lowStockItems];
    const expiringIds = new Set(expiringItems.map(item => item._id.toString()));
    for (const item of expiringItems) {
      if (!allItems.find(i => i._id.toString() === item._id.toString())) {
        allItems.push(item);
      }
    }
    
    // Generate reorder requests
    const requests: ReorderRequest[] = [];
    for (const item of allItems) {
      const request = generateReorderRequest(item);
      if (request) {
        requests.push(request);
      }
    }
    
    // Sort by priority
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    requests.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    
    // Send notifications if there are requests
    let notificationsSent = 0;
    if (requests.length > 0) {
      const notificationResult = await sendReorderNotification(
        requests,
        tenantId ? (typeof tenantId === 'string' ? new Types.ObjectId(tenantId) : tenantId) : undefined
      );
      
      if (notificationResult.sent) {
        notificationsSent = 1;
      }
    }
    
    // TODO: Create actual purchase orders in a PurchaseOrder model (if exists)
    // For now, we just send notifications
    
    return {
      success: true,
      processed: allItems.length,
      requestsCreated: requests.length,
      notificationsSent,
      errors: 0,
      requests,
    };
  } catch (error: any) {
    console.error('Error processing inventory reordering:', error);
    return {
      success: false,
      processed: 0,
      requestsCreated: 0,
      notificationsSent: 0,
      errors: 1,
      requests: [],
    };
  }
}
