import { normalizePhone } from '@/lib/phone';

const dayOf = (v: unknown) => {
  const d = v ? new Date(v as string) : null;
  return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String(v ?? '');
};
const phoneOf = (v: unknown) => normalizePhone(String(v ?? '')) ?? String(v ?? '');
const emailOf = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** Sign-in fields (phone, email, birth date) this save would change on a record other clinics share. */
export function sharedSignInChanges(before: Record<string, any>, input: Record<string, unknown>, tenantId: string): string[] {
  const others = (before.tenantIds ?? []).some((t: unknown) => String(t) !== String(tenantId));
  if (!others) return [];
  const changed: string[] = [];
  if ('phone' in input && phoneOf(input.phone) !== phoneOf(before.phone)) changed.push('phone');
  if ('email' in input && emailOf(input.email) !== emailOf(before.email)) changed.push('email');
  if ('dateOfBirth' in input && dayOf(input.dateOfBirth) !== dayOf(before.dateOfBirth)) changed.push('dateOfBirth');
  return changed;
}
