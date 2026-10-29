// Automatic Inventory Reordering Automation
// Auto-creates purchase orders when stock hits reorder point or expiry is approaching

import connectDB from '@/lib/mongodb';
import Inventory from '@/models/Inventory';
import { getSettings } from '@/lib/settings';
import { sendEmail, escapeHtml } from '@/lib/email';
import { Types } from 'mongoose';
import {
  forEachTenant,
  automationEnabled,
  getTenantStaff,
  safeNotify,
  errorMessage,
  BATCH_LIMIT,
  type AutomationTenant,
} from './shared';

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
 * Send reorder digest to administrators
 */
async function sendReorderNotification(
  requests: ReorderRequest[],
  tenantId: Types.ObjectId
): Promise<{ sent: boolean; error?: string }> {
  try {
    const urgent = requests.filter(r => r.priority === 'urgent');
    const high = requests.filter(r => r.priority === 'high');
    const medium = requests.filter(r => r.priority === 'medium');
    const low = requests.filter(r => r.priority === 'low');

    const recipients = await getTenantStaff(tenantId, ['admin', 'accountant']);
    if (recipients.length === 0) {
      return { sent: false, error: 'No recipients found' };
    }

    const line = (req: ReorderRequest) =>
      `- ${req.inventoryItem.name}: Order ${req.quantity} ${req.inventoryItem.unit || 'units'} (${req.reason})\n`;

    let message = `Inventory reorder request:\n\n`;
    if (urgent.length > 0) {
      message += `🚨 URGENT (${urgent.length}):\n`;
      urgent.forEach(req => { message += line(req); });
      message += '\n';
    }
    if (high.length > 0) {
      message += `⚠️ High Priority (${high.length}):\n`;
      high.forEach(req => { message += line(req); });
      message += '\n';
    }
    if (medium.length > 0) {
      message += `📋 Medium Priority (${medium.length}):\n`;
      medium.slice(0, 10).forEach(req => { message += line(req); });
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

    let sent = false;
    for (const user of recipients) {
      const ok = await safeNotify({
        userId: user._id,
        tenantId,
        type: 'system',
        priority: urgent.length > 0 ? 'urgent' : high.length > 0 ? 'high' : 'normal',
        title: `Inventory Reorder Request (${requests.length} items)`,
        message,
        actionUrl: '/inventory',
      });
      if (ok) sent = true;
    }

    const firstAdmin = recipients.find((u: any) => u.email);
    if (firstAdmin?.email) {
      const emailHtml = `
        <h2>Inventory Reorder Request</h2>
        <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
        <p><a href="${escapeHtml(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')}/inventory">View Inventory</a></p>
      `;
      const r = await sendEmail({
        to: firstAdmin.email,
        subject: `Inventory Reorder Request - ${requests.length} Items`,
        html: emailHtml,
      }).catch((e) => {
        console.error('Error sending reorder email:', e);
        return null;
      });
      if (r?.success) sent = true;
    }

    return { sent };
  } catch (error: any) {
    console.error('Error sending reorder notification:', error);
    return { sent: false, error: errorMessage(error) };
  }
}

function emptyResult(): ReorderResult {
  return { success: true, processed: 0, requestsCreated: 0, notificationsSent: 0, errors: 0, requests: [] };
}

async function processTenant(tenant: AutomationTenant): Promise<ReorderResult> {
  const out = emptyResult();

  const settings = await getSettings(tenant.tenantId);
  if (!automationEnabled(settings, 'autoInventoryReordering')) return out;

  const tenantId = tenant.tenantObjectId;
  const ninetyDaysFromNow = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const [lowStockItems, expiringItems] = await Promise.all([
    Inventory.find({
      tenantId,
      $or: [{ status: { $in: ['low-stock', 'out-of-stock'] } }, { quantity: { $lte: 0 } }],
    })
      .limit(BATCH_LIMIT)
      .lean(),
    Inventory.find({
      tenantId,
      expiryDate: { $exists: true, $lte: ninetyDaysFromNow, $gte: new Date() },
      quantity: { $gt: 0 },
    })
      .limit(BATCH_LIMIT)
      .lean(),
  ]);

  const byId = new Map<string, any>();
  for (const item of [...lowStockItems, ...expiringItems] as any[]) byId.set(String(item._id), item);
  const allItems = Array.from(byId.values());

  const requests: ReorderRequest[] = [];
  for (const item of allItems) {
    const request = generateReorderRequest(item);
    if (request) requests.push(request);
  }

  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  requests.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  if (requests.length > 0) {
    const notificationResult = await sendReorderNotification(requests, tenantId);
    if (notificationResult.sent) out.notificationsSent = 1;
    else if (notificationResult.error) out.errors++;
  }

  out.processed = allItems.length;
  out.requestsCreated = requests.length;
  out.requests = requests.map((r) => ({
    ...r,
    inventoryItem: { _id: r.inventoryItem._id, name: r.inventoryItem.name, unit: r.inventoryItem.unit },
  }));
  return out;
}

/**
 * Process inventory items and send a reorder digest (one per tenant per run).
 * Without a tenantId every active tenant is processed.
 */
export async function processInventoryReordering(
  tenantId?: string | Types.ObjectId
): Promise<ReorderResult> {
  try {
    await connectDB();
    const runs = await forEachTenant(tenantId, processTenant, { setting: 'autoInventoryReordering' });
    const total = emptyResult();
    total.success = runs.every((r) => r.success);
    for (const run of runs) {
      if (!run.result) {
        total.errors++;
        continue;
      }
      total.processed += run.result.processed;
      total.requestsCreated += run.result.requestsCreated;
      total.notificationsSent += run.result.notificationsSent;
      total.errors += run.result.errors;
      total.requests.push(...run.result.requests);
    }
    return total;
  } catch (error: any) {
    console.error('Error processing inventory reordering:', error);
    return { ...emptyResult(), success: false, errors: 1 };
  }
}