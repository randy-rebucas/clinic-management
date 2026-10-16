/**
 * Keep only allowlisted top-level keys of a request body, dropping any value that
 * contains Mongo operator keys ("$..."), so a body can't mass-assign tenant/ownership
 * fields or smuggle operators into an update. Mongoose still casts each field to the
 * schema type on write.
 */
function hasOperatorKeys(value: unknown, depth = 0): boolean {
  if (depth > 10 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((v) => hasOperatorKeys(v, depth + 1));
  return Object.entries(value as Record<string, unknown>).some(
    ([k, v]) => k.startsWith('$') || k.includes('.') || hasOperatorKeys(v, depth + 1)
  );
}

export function pickFields<K extends string>(
  body: unknown,
  allowed: readonly K[]
): { data: Partial<Record<K, any>>; rejected: string[] } {
  const data: Partial<Record<K, any>> = {};
  const rejected: string[] = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { data, rejected };
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const value = (body as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (hasOperatorKeys(value)) {
      rejected.push(key);
      continue;
    }
    data[key] = value;
  }
  return { data, rejected };
}

/** Staff-editable Medicine catalog fields (tenantId is server-controlled). */
export const MEDICINE_FIELDS = [
  'name', 'genericName', 'brandNames', 'form', 'strength', 'unit', 'route', 'category', 'indications',
  'contraindications', 'sideEffects', 'dosageRanges', 'standardDosage', 'standardFrequency', 'duration',
  'requiresPrescription', 'controlledSubstance', 'schedule', 'active',
] as const;

/** Staff-editable Room fields (tenantId is server-controlled). */
export const ROOM_FIELDS = [
  'name', 'roomNumber', 'floor', 'building', 'roomType', 'capacity', 'equipment', 'amenities', 'status', 'notes',
  'schedule', 'availabilityOverrides',
] as const;
