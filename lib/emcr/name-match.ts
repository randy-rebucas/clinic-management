/**
 * Name matching shared by record claiming (lib/emcr/claim.ts) and cross-clinic record linking
 * (app/api/patients/me/_lib/linked-records.ts). Kept separate so the two don't import each other.
 */

/** Lowercase, no accents, single spaces: "  José  Mari " → "jose mari". */
export function normalizeName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The typed first name matches the record's: the whole first name, or its first word
 * ("Maria" for "Maria Clara"). Nicknames don't match.
 */
export function firstNameMatches(typed: unknown, stored: unknown): boolean {
  const t = normalizeName(typed);
  const s = normalizeName(stored);
  if (!t || !s) return false;
  return t === s || t === s.split(' ')[0];
}

/**
 * Two stored records name the same person: same last name, and one first name is the other or
 * its first word ("Maria" and "Maria Clara"). Twins ("Maria Clara" / "Maria Teresa") differ.
 */
export function sameStoredName(
  a: { firstName?: unknown; lastName?: unknown },
  b: { firstName?: unknown; lastName?: unknown }
): boolean {
  const lastA = normalizeName(a.lastName);
  if (!lastA || lastA !== normalizeName(b.lastName)) return false;
  return firstNameMatches(a.firstName, b.firstName) || firstNameMatches(b.firstName, a.firstName);
}
