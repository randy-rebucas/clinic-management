import { STATE } from '../dashboards/charts';
import { ADJUST_REASON, STOCK_CATEGORIES, type AdjustReason, type MovementType, type StockStatus } from '@/lib/inventory';

/**
 * Stock states on the validated state hues, by meaning: in stock = done (teal), running low =
 * pending (amber), out of stock = needs action (crimson). Expired sits outside the hue set
 * (white + outline) and carries its word in red, since expired stock must not be used.
 */
export const STOCK_STATE: Record<StockStatus, { label: string; fill: string | null; badge: string }> = {
  'in-stock': { label: 'In stock', fill: STATE.completed.fill, badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  'low-stock': { label: 'Running low', fill: STATE.pending.fill, badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  'out-of-stock': { label: 'Out of stock', fill: STATE.noShow.fill, badge: 'bg-red-50 text-red-800 ring-red-200' },
  expired: { label: 'Expired', fill: null, badge: 'bg-white text-red-800 ring-red-300' },
};

export const STATUS_ORDER: StockStatus[] = ['out-of-stock', 'expired', 'low-stock', 'in-stock'];

export const categoryLabel = (c: string) => STOCK_CATEGORIES.find((x) => x.value === c)?.label ?? c;

/** "12", "2.5": quantities may be fractional (bottles, litres) but rarely need more. */
export const qty = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 }));

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  opening: 'Opening stock',
  restock: 'Restocked',
  adjustment: 'Adjusted',
  count: 'Counted',
  dispense: 'Dispensed',
  'dispense-reversal': 'Dispense reversed',
};

export const reasonLabel = (r?: string) => (r && r in ADJUST_REASON ? ADJUST_REASON[r as AdjustReason].label : null);

/** Days the stock lasts at the last 30 days' use, or null when nothing was used. */
export function daysLeft(quantity: number, used30: number) {
  if (!(used30 > 0)) return null;
  return Math.floor(quantity / (used30 / 30));
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
