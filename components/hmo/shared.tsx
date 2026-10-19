import { FOCUS_RING, ICON } from '../appointments/shared';
import { BATCH_STATUS, type BatchStatus } from '@/lib/hmo';

export const PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-teal-dark px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
export const SECONDARY = `inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
export const LINK = `rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`;
export const CHECKBOX = 'h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal disabled:opacity-40';

export const ICONS = {
  ...ICON,
  plus: 'M12 4v16m8-8H4',
  print: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
  send: 'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
  inbox: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4',
  trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  pencil: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
};

export function BatchBadge({ status }: { status: BatchStatus }) {
  const st = BATCH_STATUS[status];
  return <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.badge}`}>{st.label}</span>;
}

const DAY = 86_400_000;
export const daysAgo = (iso: string, now = Date.now()) => Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));
const plural = (n: number, one: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : `${one}s`}`;

/** "billed today", "billed yesterday", "billed 12 days ago". */
export function agoWords(days: number, verb: string) {
  if (days === 0) return `${verb} today`;
  if (days === 1) return `${verb} yesterday`;
  return `${verb} ${plural(days, 'day')} ago`;
}

/** How old an unpaid amount is, as a tone: amber-800 from 61 days, red-700 past 90 (the invoice rule). */
export const ageTone = (days: number) => (days > 90 ? 'font-medium text-red-700' : days > 60 ? 'font-medium text-amber-800' : 'text-gray-500');

/** When the payer should pay, in words: "Due in 5 days", "Due today", "12 days past due". */
export function dueWords(dueAt: string, now = Date.now()): { text: string; late: boolean } {
  const days = Math.floor((Date.parse(dueAt) - now) / DAY);
  if (Date.parse(dueAt) < now) {
    const late = Math.max(1, Math.ceil((now - Date.parse(dueAt)) / DAY));
    return { text: `${plural(late, 'day')} past due`, late: true };
  }
  if (days === 0) return { text: 'Due today', late: false };
  return { text: `Due in ${plural(days, 'day')}`, late: false };
}

export { plural };
