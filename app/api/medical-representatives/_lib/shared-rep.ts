/**
 * A rep profile is one document shared by every clinic the rep works with, and a rep who has paid
 * for activation owns their account: clinics only pick up a link to it by approving a visit. These
 * helpers keep a clinic to its own side of that. What a clinic does control is its own link, so
 * removing the rep (DELETE) always works.
 */

type Availability = { dayOfWeek: number; startTime: string; endTime: string; isAvailable?: boolean };

type RepProfile = {
  tenantIds?: unknown[];
  isActivated?: boolean;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  territory?: string;
  products?: string[];
  notes?: string;
  status?: string;
  availability?: Availability[];
};

export type RepDetails = Omit<RepProfile, 'tenantIds' | 'isActivated'>;

/** The form sends every field on each save, so only a real change counts. */
const SIMPLE_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'company', 'territory', 'notes', 'status'] as const;

export const REP_ACCOUNT_ERROR =
  'This representative’s account isn’t managed by your clinic, so these details can’t be changed here. To stop working with them, remove them from your clinic.';

export function worksWithOtherClinics(rep: Pick<RepProfile, 'tenantIds'>, tenantId: unknown): boolean {
  return (rep.tenantIds ?? []).some((t) => String(t) !== String(tenantId));
}

const availabilityKey = (slots: Availability[] | undefined) =>
  JSON.stringify((slots ?? []).map((s) => [s.dayOfWeek, s.startTime, s.endTime, s.isAvailable ?? true]));

/** The fields in `input` that differ from the stored profile. */
export function changedRepDetails(rep: RepProfile, input: RepDetails): string[] {
  const changed: string[] = SIMPLE_FIELDS.filter((f) => input[f] !== undefined && input[f] !== (rep[f] ?? ''));
  if (input.products && JSON.stringify(input.products) !== JSON.stringify([...(rep.products ?? [])])) changed.push('products');
  if (input.availability && availabilityKey(input.availability) !== availabilityKey(rep.availability)) changed.push('availability');
  return changed;
}

/**
 * The changes in `input` this clinic may not make; empty when the save can go ahead.
 *
 * Setting an activated rep back to active stays allowed: nothing else can undo a deactivation made
 * before this rule, and it can only restore access the rep paid for. Notes are the clinic's own, so
 * they stay editable until another clinic would see them.
 */
export function refusedRepChanges(rep: RepProfile, tenantId: unknown, input: RepDetails): string[] {
  const shared = worksWithOtherClinics(rep, tenantId);
  if (!shared && !rep.isActivated) return [];
  return changedRepDetails(rep, input).filter((field) => {
    if (field === 'notes') return shared;
    if (field === 'status') return !(rep.isActivated && input.status === 'active');
    return true;
  });
}

/** Account fields that belong to the rep (payment, sign-in, team) and are never shown to a clinic. */
export const PRIVATE_REP_FIELDS = [
  'internalNotes',
  'paymentDate',
  'paymentAmount',
  'paymentMethod',
  'paymentReference',
  'password',
  'subscription',
  'teamInvite',
] as const;

/** Mongoose projection that leaves out PRIVATE_REP_FIELDS. */
export const HIDDEN_REP_FIELDS = PRIVATE_REP_FIELDS.map((f) => `-${f}`).join(' ');

/**
 * A rep profile as one clinic may see it: no private account fields, no notes when another clinic
 * shares the profile, and no list of the other clinics (only whether there are any).
 */
export function repForClinic(rep: Record<string, unknown>, tenantId: unknown): Record<string, unknown> {
  const shared = worksWithOtherClinics(rep as Pick<RepProfile, 'tenantIds'>, tenantId);
  const out: Record<string, unknown> = { ...rep };
  for (const field of PRIVATE_REP_FIELDS) delete out[field];
  if (shared) delete out.notes;
  delete out.tenantIds;
  out.sharedWithOtherClinics = shared;
  return out;
}

/** Notes are a clinic's own and say nothing of who wrote them, so a shared profile shows none. */
export function hideOtherClinicsNotes<T extends { tenantIds?: unknown[]; notes?: string }>(rep: T, tenantId: unknown): T {
  if (!worksWithOtherClinics(rep, tenantId)) return rep;
  const { notes: _notes, ...rest } = rep;
  void _notes;
  return rest as T;
}
