/**
 * Inventory vocabulary shared by the API and the inventory pages: statuses, categories, and the
 * expiry horizon an item's stock falls into.
 */

export type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock' | 'expired';
export const STOCK_STATUSES: StockStatus[] = ['in-stock', 'low-stock', 'out-of-stock', 'expired'];

export type StockCategory = 'medicine' | 'supply' | 'equipment' | 'other';
export const STOCK_CATEGORIES: { value: StockCategory; label: string }[] = [
  { value: 'medicine', label: 'Medicine' },
  { value: 'supply', label: 'Supply' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'other', label: 'Other' },
];

export type ExpiryKey = 'expired' | '30' | '90' | '180';

/** Stock on hand by how soon it expires. Each bucket is exclusive of the one before it. */
export const EXPIRY: { key: ExpiryKey; label: string; chip: string; fromDays: number | null; toDays: number }[] = [
  { key: 'expired', label: 'Already expired', chip: 'Expired', fromDays: null, toDays: 0 },
  { key: '30', label: 'Within 30 days', chip: 'Expires within 30 days', fromDays: 0, toDays: 30 },
  { key: '90', label: 'In 31–90 days', chip: 'Expires in 31–90 days', fromDays: 30, toDays: 90 },
  { key: '180', label: 'In 91–180 days', chip: 'Expires in 91–180 days', fromDays: 90, toDays: 180 },
];

export const isExpiryKey = (v: string | null | undefined): v is ExpiryKey => EXPIRY.some((e) => e.key === v);

const DAY = 86_400_000;

/** The expiryDate range for a bucket: after `fromDays` from now, up to `toDays` from now. */
export function expiryRange(key: ExpiryKey, now = new Date()): { $gte?: Date; $lt: Date } {
  const b = EXPIRY.find((e) => e.key === key)!;
  const range: { $gte?: Date; $lt: Date } = { $lt: new Date(now.getTime() + b.toDays * DAY) };
  if (b.fromDays !== null) range.$gte = new Date(now.getTime() + b.fromDays * DAY);
  return range;
}

/** Whole days from now until a date (negative once past). */
export function daysUntil(iso: string | Date, now = new Date()) {
  return Math.floor((new Date(iso).getTime() - now.getTime()) / DAY);
}

export type InventorySort = 'urgent' | 'name' | 'expiry' | 'value';

export type MovementType = 'opening' | 'restock' | 'adjustment' | 'count' | 'dispense' | 'dispense-reversal';

export type AdjustReason = 'used' | 'damaged' | 'expired' | 'returned' | 'found' | 'other';
export const ADJUST_REASONS: AdjustReason[] = ['used', 'damaged', 'expired', 'returned', 'found', 'other'];

/** Which way each reason moves stock, and how it reads in the history. */
export const ADJUST_REASON: Record<AdjustReason, { label: string; direction: 'out' | 'in' | 'either' }> = {
  used: { label: 'Used in the clinic', direction: 'out' },
  damaged: { label: 'Damaged or spoiled', direction: 'out' },
  expired: { label: 'Expired, thrown away', direction: 'out' },
  returned: { label: 'Returned to supplier', direction: 'out' },
  found: { label: 'Found in storage', direction: 'in' },
  other: { label: 'Other', direction: 'either' },
};
