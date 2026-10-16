import { STATE } from '../dashboards/charts';

export type RxStatus = 'active' | 'partially-dispensed' | 'dispensed' | 'completed' | 'cancelled';

/**
 * Prescription states on the validated state hues: waiting blue, partly amber, dispensed teal.
 * Completed (gray fill + outline) and cancelled (white + outline) sit outside the hue set: gray failed
 * the colour-blind check against teal, so those two are told apart by fill and label, not hue.
 * Shared by the prescriptions list and the prescription page.
 */
export const RX_STATE: Record<RxStatus, { label: string; fill: string | null; muted?: boolean; badge: string }> = {
  active: { label: 'To dispense', fill: STATE.upcoming.fill, badge: 'bg-brand-teal-light text-brand-teal-deep ring-brand-teal/30' },
  'partially-dispensed': { label: 'Partly dispensed', fill: STATE.pending.fill, badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  dispensed: { label: 'Dispensed', fill: STATE.completed.fill, badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  completed: { label: 'Completed', fill: null, muted: true, badge: 'bg-gray-100 text-gray-700 ring-gray-200' },
  cancelled: { label: 'Cancelled', fill: null, badge: 'bg-white text-gray-600 ring-gray-300' },
};
export const STATUS_ORDER: RxStatus[] = ['active', 'partially-dispensed', 'dispensed', 'completed', 'cancelled'];

/** "500 mg capsule, oral" from the parts that are present. */
export function medicineForm(m: { strength?: string; form?: string; route?: string }) {
  const what = [m.strength, m.form].filter(Boolean).join(' ');
  return [what, m.route].filter(Boolean).join(', ');
}

/** "1 tablet · Three times daily · 7 days" from the parts that are present. */
export function medicineDirections(m: { dose?: string; frequency?: string; durationDays?: number | null }) {
  return [m.dose, m.frequency, m.durationDays ? `${m.durationDays} ${m.durationDays === 1 ? 'day' : 'days'}` : null].filter(Boolean).join(' · ');
}
