/**
 * The clinic's reports and who may open each. One rule, used by the reports page (which tabs to
 * show) and by each report's API route (whether to answer), so a tab is never shown that would
 * then refuse to load. Every report also needs reports:read.
 */

export type ReportKey = 'consultations' | 'income' | 'hmo-claims' | 'bir' | 'patients' | 'inventory';

type Can = (resource: string, action: string) => boolean;

export const REPORTS: {
  key: ReportKey;
  label: string;
  /** API path under /api/reports. */
  path: string;
  /** Whether the period control applies. Snapshot reports describe "now". */
  ranged: boolean;
  needs: [string, string] | null;
}[] = [
  { key: 'consultations', label: 'Consultations', path: 'consultations', ranged: true, needs: null },
  // Money reports: billing staff (invoices:write), as the income/HMO routes allowed before (admin, accountant).
  { key: 'income', label: 'Income', path: 'income', ranged: true, needs: ['invoices', 'write'] },
  { key: 'hmo-claims', label: 'HMO claims', path: 'hmo-claims', ranged: false, needs: ['invoices', 'write'] },
  // Sales invoices issued, for the books BIR asks for; billing staff, like the other money reports.
  { key: 'bir', label: 'BIR books', path: 'bir', ranged: true, needs: ['invoices', 'write'] },
  // Aggregates only; whoever may read patients or inventory may read their totals.
  { key: 'patients', label: 'Patients', path: 'demographics', ranged: true, needs: ['patients', 'read'] },
  { key: 'inventory', label: 'Inventory', path: 'inventory', ranged: true, needs: ['inventory', 'read'] },
];

export function canOpenReport(can: Can, key: ReportKey): boolean {
  if (!can('reports', 'read')) return false;
  const r = REPORTS.find((x) => x.key === key);
  return Boolean(r && (!r.needs || can(r.needs[0], r.needs[1])));
}

export type ReportPeriod = 'week' | 'month' | 'last-month' | 'custom';

/** Custom ranges in the page are kept to three months so a day-by-day chart stays readable. */
export const MAX_CUSTOM_DAYS = 92;
