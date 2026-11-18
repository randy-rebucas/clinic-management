/**
 * Record lists for an account without an active eMCR year (`requireActiveEmcr` refused
 * 'records'). The list still says which records exist (test, date, status), so Home and the
 * Results tab keep working and the patient sees what activating would open; the clinical content
 * stays behind the detail routes, which answer 402 ACTIVATION_REQUIRED.
 *
 * Without this, a list served the same payload as the gated detail route.
 */

/** Lab result: what the row shows (eMCR app/patient/(tabs)/results.tsx LabRow), never values. */
export const LOCKED_LAB_RESULT_FIELDS = [
  '_id',
  'tenantId',
  'status',
  'orderDate',
  'resultDate',
  'createdAt',
  'requestCode',
  'orderCode',
  'request.testType',
] as const;

/** Visit: date, type, doctor and status, never the complaint, diagnoses or notes. */
export const LOCKED_VISIT_FIELDS = ['_id', 'tenantId', 'visitCode', 'date', 'provider', 'visitType', 'status', 'createdAt'] as const;

/** Referral: everything the list selects except the clinical reason. */
export const LOCKED_REFERRAL_DROP = ['reason'] as const;

/** Copy of `record` with only `paths` (dotted for one level of nesting, as 'request.testType'). */
export function pickFields<T extends Record<string, any>>(record: T, paths: readonly string[]): Partial<T> {
  const out: Record<string, any> = {};
  for (const path of paths) {
    const [head, child] = path.split('.', 2);
    const value = record[head];
    if (value === undefined) continue;
    if (!child) {
      out[head] = value;
    } else if (value && typeof value === 'object' && value[child] !== undefined) {
      out[head] = { ...(out[head] ?? {}), [child]: value[child] };
    }
  }
  return out as Partial<T>;
}

/** Copy of `record` without the top-level `fields`. */
export function dropFields<T extends Record<string, any>>(record: T, fields: readonly string[]): Partial<T> {
  const out: Record<string, any> = { ...record };
  for (const field of fields) delete out[field];
  return out as Partial<T>;
}
