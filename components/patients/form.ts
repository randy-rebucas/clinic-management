// Shape, checks and payload for the patient registration / edit form.

export type Sex = '' | 'male' | 'female' | 'other';
export type ConditionStatus = 'active' | 'chronic' | 'resolved';

export interface AllergyRow {
  _key: string;
  substance: string;
  reaction: string;
  severity: string;
}
export interface ConditionRow {
  _key: string;
  condition: string;
  status: ConditionStatus;
  diagnosisDate: string;
  /** Not edited here; carried through so saving never drops it. */
  notes: string;
}
export interface FamilyRow {
  _key: string;
  condition: string;
  relation: string;
}

export interface PatientDraft {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  dateOfBirth: string;
  sex: Sex;
  civilStatus: string;
  nationality: string;
  occupation: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  province: string;
  zipCode: string;
  ecName: string;
  ecPhone: string;
  ecRelationship: string;
  philHealth: string;
  govId: string;
  medicalHistory: string;
  allergies: AllergyRow[];
  conditions: ConditionRow[];
  family: FamilyRow[];
}

export type FieldKey = Exclude<keyof PatientDraft, 'allergies' | 'conditions' | 'family'>;

/** The patient as GET /api/patients/[id] returns it (legacy shapes included). */
export interface PatientRecord {
  _id: string;
  patientCode?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  suffix?: string;
  dateOfBirth?: string;
  sex?: string;
  civilStatus?: string;
  nationality?: string;
  occupation?: string;
  phone?: string;
  email?: string;
  address?: { street?: string; city?: string; state?: string; zipCode?: string };
  emergencyContact?: { name?: string; phone?: string; relationship?: string; relation?: string };
  identifiers?: { philHealth?: string; govId?: string };
  medicalHistory?: string;
  preExistingConditions?: { condition?: string; status?: string; diagnosisDate?: string; notes?: string }[];
  allergies?: (string | { substance?: string; reaction?: string; severity?: string })[] | string;
  familyHistory?: Record<string, string>;
}

export const SEVERITIES = [
  { value: 'unknown', label: 'Not known' },
  { value: 'mild', label: 'Mild' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
  { value: 'life-threatening', label: 'Life-threatening' },
];
export const CONDITION_STATUSES: { value: ConditionStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'chronic', label: 'Chronic' },
  { value: 'resolved', label: 'Resolved' },
];
export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Annulled'];
export const CONTACT_RELATIONSHIPS = ['Spouse', 'Mother', 'Father', 'Parent', 'Child', 'Sibling', 'Relative', 'Guardian', 'Friend'];
export const FAMILY_RELATIONS = ['Mother', 'Father', 'Sibling', 'Grandparent', 'Child', "Mother's side", "Father's side"];

let seq = 0;
export const rowKey = () => `r${++seq}`;

const s = (v: unknown) => (typeof v === 'string' ? v : '');
const dateKey = (v?: string) => (v ? s(v).slice(0, 10) : '');

export function draftFrom(p?: PatientRecord | null): PatientDraft {
  const rawAllergies = p?.allergies;
  const allergyList = typeof rawAllergies === 'string' ? rawAllergies.split(',') : rawAllergies ?? [];
  return {
    firstName: s(p?.firstName),
    middleName: s(p?.middleName),
    lastName: s(p?.lastName),
    suffix: s(p?.suffix),
    dateOfBirth: dateKey(p?.dateOfBirth),
    sex: p?.sex === 'male' || p?.sex === 'female' || p?.sex === 'other' ? p.sex : '',
    civilStatus: s(p?.civilStatus),
    nationality: s(p?.nationality),
    occupation: s(p?.occupation),
    phone: s(p?.phone),
    email: s(p?.email),
    street: s(p?.address?.street),
    city: s(p?.address?.city),
    province: s(p?.address?.state),
    zipCode: s(p?.address?.zipCode),
    ecName: s(p?.emergencyContact?.name),
    ecPhone: s(p?.emergencyContact?.phone),
    ecRelationship: s(p?.emergencyContact?.relationship) || s(p?.emergencyContact?.relation),
    philHealth: s(p?.identifiers?.philHealth),
    govId: s(p?.identifiers?.govId),
    medicalHistory: s(p?.medicalHistory),
    allergies: allergyList
      .map((a) => (typeof a === 'string' ? { substance: a.trim(), reaction: '', severity: 'unknown' } : { substance: s(a?.substance), reaction: s(a?.reaction), severity: s(a?.severity) || 'unknown' }))
      .filter((a) => a.substance || a.reaction)
      .map((a) => ({ _key: rowKey(), ...a })),
    conditions: (p?.preExistingConditions ?? []).map((c) => ({
      _key: rowKey(),
      condition: s(c.condition),
      status: c.status === 'chronic' || c.status === 'resolved' ? c.status : 'active',
      diagnosisDate: dateKey(c.diagnosisDate),
      notes: s(c.notes),
    })),
    family: Object.entries(p?.familyHistory ?? {}).map(([condition, relation]) => ({ _key: rowKey(), condition, relation: s(relation) })),
  };
}

/** Everything but the row keys, for "has anything changed". */
export function snapshot(d: PatientDraft) {
  const strip = <T extends { _key: string }>(rows: T[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== '_key')));
  return JSON.stringify({ ...d, allergies: strip(d.allergies), conditions: strip(d.conditions), family: strip(d.family) });
}

export function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PHONE_CHARS = /^[+0-9 ()-]+$/;
const phoneProblem = (v: string) => {
  const t = v.trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, '').length;
  if (!PHONE_CHARS.test(t) || digits < 7 || digits > 15) return 'Enter digits only, for example 0917 123 4567.';
  return null;
};

export interface Problems {
  fields: Partial<Record<FieldKey, string>>;
  /** Keyed by row `_key`. */
  rows: Record<string, string>;
}

export function problemsOf(d: PatientDraft, today: string): Problems {
  const fields: Problems['fields'] = {};
  const need = (key: FieldKey, message: string) => {
    if (!d[key].trim()) fields[key] = message;
  };
  need('firstName', 'Enter the first name.');
  need('lastName', 'Enter the last name.');
  if (!d.dateOfBirth) fields.dateOfBirth = 'Enter the date of birth.';
  else if (d.dateOfBirth > today) fields.dateOfBirth = 'The date of birth is in the future.';
  else if (d.dateOfBirth < '1900-01-01') fields.dateOfBirth = 'Check the year.';
  if (!d.sex) fields.sex = 'Choose the sex recorded on their ID.';
  need('phone', 'Enter a mobile or phone number.');
  const pp = phoneProblem(d.phone);
  if (pp && !fields.phone) fields.phone = pp;
  if (d.email.trim() && !/^\S+@\S+\.\S+$/.test(d.email.trim())) fields.email = 'This doesn’t look like an email address.';
  need('street', 'Enter the house number, street and barangay.');
  need('city', 'Enter the city or municipality.');
  need('province', 'Enter the province.');
  need('zipCode', 'Enter the ZIP code.');
  const ecp = phoneProblem(d.ecPhone);
  if (ecp) fields.ecPhone = ecp;

  const rows: Problems['rows'] = {};
  for (const a of d.allergies) if (!a.substance.trim() && a.reaction.trim()) rows[a._key] = 'Name what they are allergic to, or remove this row.';
  for (const c of d.conditions) {
    if (!c.condition.trim() && c.diagnosisDate) rows[c._key] = 'Name the condition, or remove this row.';
    else if (c.diagnosisDate && c.diagnosisDate > today) rows[c._key] = 'The date is in the future.';
  }
  for (const f of d.family) if (!f.condition.trim() && f.relation.trim()) rows[f._key] = 'Name the condition, or remove this row.';
  return { fields, rows };
}

/**
 * The request body for POST (create) and PUT (edit). Blank optional fields are sent as '':
 * the create route drops them, the edit route removes them from the record.
 */
export function payloadOf(d: PatientDraft) {
  const t = (v: string) => v.trim();
  const family: Record<string, string> = {};
  for (const f of d.family) {
    const key = t(f.condition);
    if (!key) continue;
    family[key] = family[key] && t(f.relation) ? `${family[key]}, ${t(f.relation)}` : family[key] || t(f.relation);
  }
  return {
    firstName: t(d.firstName),
    middleName: t(d.middleName),
    lastName: t(d.lastName),
    suffix: t(d.suffix),
    dateOfBirth: d.dateOfBirth,
    sex: d.sex,
    civilStatus: t(d.civilStatus),
    nationality: t(d.nationality),
    occupation: t(d.occupation),
    phone: t(d.phone),
    email: t(d.email),
    address: { street: t(d.street), city: t(d.city), state: t(d.province), zipCode: t(d.zipCode) },
    // `relation` is the legacy spelling (read as a fallback); clearing it keeps one source of truth.
    emergencyContact: { name: t(d.ecName), phone: t(d.ecPhone), relationship: t(d.ecRelationship), relation: '' },
    identifiers: { philHealth: t(d.philHealth), govId: t(d.govId) },
    medicalHistory: t(d.medicalHistory),
    allergies: d.allergies.filter((a) => t(a.substance)).map((a) => ({ substance: t(a.substance), reaction: t(a.reaction), severity: a.severity || 'unknown' })),
    preExistingConditions: d.conditions
      .filter((c) => t(c.condition))
      .map((c) => ({
        condition: t(c.condition),
        status: c.status,
        ...(c.diagnosisDate ? { diagnosisDate: c.diagnosisDate } : {}),
        ...(c.notes ? { notes: c.notes } : {}),
      })),
    familyHistory: family,
  };
}

/** Where a server validation issue (`issues[].path`) belongs on the form. */
export const SERVER_FIELDS: Record<string, FieldKey> = {
  firstName: 'firstName',
  middleName: 'middleName',
  lastName: 'lastName',
  suffix: 'suffix',
  dateOfBirth: 'dateOfBirth',
  sex: 'sex',
  civilStatus: 'civilStatus',
  nationality: 'nationality',
  occupation: 'occupation',
  phone: 'phone',
  email: 'email',
  'address.street': 'street',
  'address.city': 'city',
  'address.state': 'province',
  'address.zipCode': 'zipCode',
  'emergencyContact.name': 'ecName',
  'emergencyContact.phone': 'ecPhone',
  'emergencyContact.relationship': 'ecRelationship',
  'identifiers.philHealth': 'philHealth',
  'identifiers.govId': 'govId',
  medicalHistory: 'medicalHistory',
};

/** "34 years old", "14 months old", "12 days old" for a YYYY-MM-DD birth date up to `today`. */
export function ageText(dob: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || dob > today) return null;
  const [by, bm, bd] = dob.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
  if (months < 0) months = 0;
  if (months >= 24) return `${Math.floor(months / 12)} years old`;
  if (months >= 1) return `${months} ${months === 1 ? 'month' : 'months'} old`;
  const days = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
  return days === 0 ? 'Born today' : `${days} ${days === 1 ? 'day' : 'days'} old`;
}
