// Medical Representative Reminders
// Push to the rep mobile app: upcoming visits and products about to expire.

import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import Product from '@/models/Product';
import { sendPushToUserDevices, type PushPayload } from '@/lib/push-notifications';
import { BATCH_LIMIT, errorMessage } from './shared';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Products are flagged once when they come within this many days of expiry. */
export const PRODUCT_EXPIRY_WINDOW_DAYS = 30;

export interface MedrepReminderResult {
  success: boolean;
  visitReminders: number;
  expiryAlerts: number;
  errors: string[];
}

type Visit = { _id: unknown; userId: unknown; clinicName: string; date: Date; time: string };
type ExpiringProduct = { _id: unknown; userId: unknown; name: string; expiryDate: Date };

function groupByUser<T extends { userId: unknown }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = String(row.userId);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

/** Reps who switched push off in the app's settings. */
async function mutedUserIds(userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const muted = await MedicalRepresentative.find({ userId: { $in: userIds }, notificationsEnabled: false })
    .select('userId')
    .lean<Array<{ userId: unknown }>>();
  return new Set(muted.map((r) => String(r.userId)));
}

/** "today" / "tomorrow" / "Mon, Oct 20" for a visit date (stored as UTC midnight of the day). */
export function visitDayLabel(date: Date, now: Date = new Date()): string {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diff = Math.round((day - today) / DAY_MS);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function visitReminderMessage(visits: Visit[], now: Date = new Date()): PushPayload {
  const sorted = [...visits].sort((a, b) => +a.date - +b.date || a.time.localeCompare(b.time));
  const first = sorted[0];
  if (sorted.length === 1) {
    return {
      title: 'Upcoming visit',
      body: `${first.clinicName}, ${visitDayLabel(first.date, now)} at ${first.time}`,
      data: { screen: 'visits', id: String(first._id) },
    };
  }
  return {
    title: `${sorted.length} upcoming visits`,
    body: `Next: ${first.clinicName}, ${visitDayLabel(first.date, now)} at ${first.time}`,
    data: { screen: 'visits' },
  };
}

export function expiryAlertMessage(products: ExpiringProduct[]): PushPayload {
  if (products.length === 1) {
    const [p] = products;
    return {
      title: 'Product expiring soon',
      body: `${p.name} expires on ${p.expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`,
      data: { screen: 'products', id: String(p._id) },
    };
  }
  return {
    title: `${products.length} products expiring soon`,
    body: `Within the next ${PRODUCT_EXPIRY_WINDOW_DAYS} days`,
    data: { screen: 'products' },
  };
}

/**
 * Push each rep (at most one message per kind per run):
 *  - scheduled visits from today until 24 h from now that have not been reminded yet;
 *  - active products expiring within PRODUCT_EXPIRY_WINDOW_DAYS that have not been flagged yet.
 * Rows are marked as handled whether or not a device was registered, so a rep without the app
 * isn't retried every day. Editing a visit's date/time or a product's expiry clears the mark.
 */
export async function processMedrepReminders(now: Date = new Date()): Promise<MedrepReminderResult> {
  const result: MedrepReminderResult = { success: true, visitReminders: 0, expiryAlerts: 0, errors: [] };
  await connectDB();

  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [visits, products] = await Promise.all([
    MedicalRepresentativeVisit.find({
      status: 'scheduled',
      date: { $gte: todayStart, $lte: new Date(now.getTime() + DAY_MS) },
      reminderSentAt: null,
    })
      .select('userId clinicName date time')
      .limit(BATCH_LIMIT)
      .lean<Visit[]>(),
    Product.find({
      status: 'active',
      expiryDate: { $gte: now, $lte: new Date(now.getTime() + PRODUCT_EXPIRY_WINDOW_DAYS * DAY_MS) },
      expiryAlertSentAt: null,
    })
      .select('userId name expiryDate')
      .limit(BATCH_LIMIT)
      .lean<ExpiringProduct[]>(),
  ]);

  const visitGroups = groupByUser(visits);
  const productGroups = groupByUser(products);
  const muted = await mutedUserIds([...new Set([...visitGroups.keys(), ...productGroups.keys()])]);

  for (const [userId, rows] of visitGroups) {
    try {
      if (!muted.has(userId)) {
        const { sent } = await sendPushToUserDevices(userId, { ...visitReminderMessage(rows, now), tag: 'medrep-visit' });
        if (sent) result.visitReminders++;
      }
      await MedicalRepresentativeVisit.updateMany(
        { _id: { $in: rows.map((r) => r._id) } },
        { $set: { reminderSentAt: now } }
      );
    } catch (error) {
      result.errors.push(`visits for ${userId}: ${errorMessage(error)}`);
    }
  }

  for (const [userId, rows] of productGroups) {
    try {
      if (!muted.has(userId)) {
        const { sent } = await sendPushToUserDevices(userId, { ...expiryAlertMessage(rows), tag: 'medrep-product-expiry' });
        if (sent) result.expiryAlerts++;
      }
      await Product.updateMany(
        { _id: { $in: rows.map((r) => r._id) } },
        { $set: { expiryAlertSentAt: now } }
      );
    } catch (error) {
      result.errors.push(`products for ${userId}: ${errorMessage(error)}`);
    }
  }

  result.success = result.errors.length === 0;
  return result;
}
