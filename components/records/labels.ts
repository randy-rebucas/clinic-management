/** Record states in the product's words, shared by the visit and patient pages. */

export const RX_LABEL: Record<string, string> = {
  active: 'Waiting to dispense',
  'partially-dispensed': 'Partly dispensed',
  dispensed: 'Dispensed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const LAB_LABEL: Record<string, string> = {
  ordered: 'At the lab',
  'in-progress': 'At the lab',
  completed: 'Result in, to review',
  reviewed: 'Reviewed',
  cancelled: 'Cancelled',
};

export const INVOICE_LABEL: Record<string, string> = { unpaid: 'Unpaid', partial: 'Part paid', paid: 'Paid', refunded: 'Refunded' };

export function money(n: number, currency = 'PHP') {
  try {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `₱${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export const fileSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
