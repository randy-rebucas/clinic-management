import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Patient', () => ({ default: { find: vi.fn(), findById: vi.fn(), updateMany: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/EmcrAccount', () => ({ default: { findById: vi.fn(), updateOne: vi.fn() } }));
vi.mock('@/models/EmcrAccessRequest', () => ({ default: { updateOne: vi.fn() } }));
vi.mock('@/app/api/patients/me/_lib/linked-records', () => ({
  linkRecordsByVerifiedPhone: vi.fn(),
  linkedRecords: vi.fn(async (p: any) => ({ patientIds: [p._id], tenantIds: [], records: [] })),
}));
vi.mock('@/lib/emcr/account', () => ({ attachSelf: vi.fn(), forgetAccountCache: vi.fn() }));
vi.mock('@/lib/patient-family', async () => {
  const actual = await vi.importActual<any>('@/lib/patient-family');
  return { ...actual, personRecordIds: vi.fn(async (id: unknown) => [id]) };
});

import { Types } from 'mongoose';
import Patient from '@/models/Patient';
import EmcrAccount from '@/models/EmcrAccount';
import EmcrAccessRequest from '@/models/EmcrAccessRequest';
import { attachSelf } from '@/lib/emcr/account';
import { linkRecordsByVerifiedPhone } from '@/app/api/patients/me/_lib/linked-records';
import {
  birthDay,
  claimProfile,
  firstNameMatches,
  groupMatches,
  issueClaimToken,
  normalizeName,
  readClaimToken,
} from '@/lib/emcr/claim';

const ACCOUNT = new Types.ObjectId('507f1f77bcf86cd799439011');
const PARENT = new Types.ObjectId('507f1f77bcf86cd799439022');
const CHILD = new Types.ObjectId('507f1f77bcf86cd799439033');
const TWIN = new Types.ObjectId('507f1f77bcf86cd799439044');
const GRANDMA = new Types.ObjectId('507f1f77bcf86cd799439055');
const TENANT = new Types.ObjectId('507f1f77bcf86cd799439066');
const PHONE = '+639171234567';
const NOW = new Date('2026-10-21T00:00:00Z');

const household = [
  { _id: PARENT, firstName: 'Maria Clara', lastName: 'Santos', dateOfBirth: new Date('1990-03-04T00:00:00Z'), phone: '09171234567', tenantIds: [TENANT] },
  { _id: CHILD, firstName: 'Juan', lastName: 'Santos', dateOfBirth: new Date('2016-06-01T00:00:00Z'), phone: '09171234567', tenantIds: [TENANT] },
  { _id: TWIN, firstName: 'José', lastName: 'Santos', dateOfBirth: new Date('2016-06-01T00:00:00Z'), phone: '09171234567', tenantIds: [TENANT] },
  // Grandma lists the number as her emergency contact only.
  { _id: GRANDMA, firstName: 'Lourdes', lastName: 'Reyes', dateOfBirth: new Date('1950-01-01T00:00:00Z'), phone: '09990000000', tenantIds: [TENANT] },
];

function onPhone(records: unknown[]) {
  vi.mocked(Patient.find).mockReturnValue({ select: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(records) }) }) } as any);
}
function account(value: unknown) {
  vi.mocked(EmcrAccount.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(value) } as any);
}

describe('answer matching', () => {
  it('ignores case, accents and extra spaces', () => {
    expect(normalizeName('  José   MARI ')).toBe('jose mari');
  });

  it('accepts the whole first name or its first word, nothing looser', () => {
    expect(firstNameMatches('maria', 'Maria Clara')).toBe(true);
    expect(firstNameMatches('Maria Clara', 'Maria Clara')).toBe(true);
    expect(firstNameMatches('Mar', 'Maria Clara')).toBe(false);
    expect(firstNameMatches('Clara', 'Maria Clara')).toBe(false);
    expect(firstNameMatches('', 'Maria')).toBe(false);
  });

  it('reads birth dates as calendar days', () => {
    expect(birthDay('2016-06-01')).toBe('2016-06-01');
    expect(birthDay(new Date('2016-06-01T00:00:00Z'))).toBe('2016-06-01');
    expect(birthDay('not a date')).toBeNull();
  });

  it('tells twins apart by first name', () => {
    expect(groupMatches(household as any, 'Juan', '2016-06-01').map((g) => g.map((r) => r._id))).toEqual([[CHILD]]);
    expect(groupMatches(household as any, 'Jose', '2016-06-01').map((g) => g.map((r) => r._id))).toEqual([[TWIN]]);
    expect(groupMatches(household as any, 'Juan', '2016-06-02')).toEqual([]);
  });
});

describe('claim token', () => {
  it('round-trips the account and phone, and rejects tampering', () => {
    const { token } = issueClaimToken(String(ACCOUNT), PHONE);
    expect(readClaimToken(token)).toEqual({ accountId: String(ACCOUNT), phone: PHONE });
    expect(readClaimToken(token.slice(0, -2) + 'xx')).toBeNull();
    expect(readClaimToken('')).toBeNull();
  });
});

describe('claimProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onPhone(household);
  });

  it('links your own record when it carries the verified number as its own phone', async () => {
    account({ _id: ACCOUNT, phone: PHONE });
    const result = await claimProfile({ accountId: String(ACCOUNT), phone: PHONE, relation: 'self', firstName: 'Maria', dateOfBirth: '1990-03-04', now: NOW });
    expect(result).toEqual({ status: 'linked', relation: 'self', patientId: String(PARENT) });
    expect(linkRecordsByVerifiedPhone).toHaveBeenCalledWith(String(PARENT), PHONE);
    expect(attachSelf).toHaveBeenCalledWith(ACCOUNT, PARENT);
  });

  it('never takes a record that only lists the number as a contact as "you"', async () => {
    account({ _id: ACCOUNT, phone: PHONE });
    const result = await claimProfile({ accountId: String(ACCOUNT), phone: PHONE, relation: 'self', firstName: 'Lourdes', dateOfBirth: '1950-01-01', now: NOW });
    expect(result).toEqual({ status: 'no_match' });
    expect(attachSelf).not.toHaveBeenCalled();
  });

  it('refuses a wrong birth date', async () => {
    account({ _id: ACCOUNT, phone: PHONE });
    expect(await claimProfile({ accountId: String(ACCOUNT), phone: PHONE, relation: 'self', firstName: 'Maria', dateOfBirth: '1990-03-05', now: NOW })).toEqual({ status: 'no_match' });
  });

  it('adds a minor to a guardian-only account', async () => {
    account({ _id: ACCOUNT, phone: PHONE, dependents: [] });
    const result = await claimProfile({ accountId: String(ACCOUNT), phone: PHONE, relation: 'other', firstName: 'Juan', dateOfBirth: '2016-06-01', relationship: 'child', now: NOW });
    expect(result).toEqual({ status: 'linked', relation: 'other', patientId: String(CHILD) });
    const [, update] = vi.mocked(EmcrAccount.updateOne).mock.calls[0] as any[];
    expect(update.$push.dependents).toMatchObject({ patientId: CHILD, source: 'phone_dob', relationship: 'child' });
  });

  it('adds a minor on the child record when the holder has a record (existing family rules)', async () => {
    account({ _id: ACCOUNT, phone: PHONE, selfPatientId: PARENT, dependents: [] });
    const result = await claimProfile({ accountId: String(ACCOUNT), phone: PHONE, relation: 'other', firstName: 'Juan', dateOfBirth: '2016-06-01', now: NOW });
    expect(result.status).toBe('linked');
    const [filter, update] = vi.mocked(Patient.updateMany).mock.calls.at(-1) as any[];
    expect(filter._id.$in).toEqual([CHILD]);
    expect(update.$push.guardians).toMatchObject({ patient: PARENT, source: 'phone' });
    expect(EmcrAccount.updateOne).not.toHaveBeenCalled();
  });

  it('sends an adult someone else’s to the clinic instead of linking it', async () => {
    onPhone([{ ...household[3], 'contacts.phone': PHONE }]);
    account({ _id: ACCOUNT, phone: PHONE, dependents: [] });
    const result = await claimProfile({ accountId: String(ACCOUNT), phone: PHONE, relation: 'other', firstName: 'Lourdes', dateOfBirth: '1950-01-01', relationship: 'grandparent', now: NOW });
    expect(result).toEqual({ status: 'pending_approval', clinics: 1 });
    expect(EmcrAccessRequest.updateOne).toHaveBeenCalledTimes(1);
    const [filter] = vi.mocked(EmcrAccessRequest.updateOne).mock.calls[0] as any[];
    expect(filter).toMatchObject({ kind: 'adult_profile', accountId: ACCOUNT, patientId: GRANDMA, status: 'pending' });
    expect(EmcrAccount.updateOne).not.toHaveBeenCalled();
    expect(Patient.updateMany).not.toHaveBeenCalled();
  });

  it('a second "self" record on the same account is refused', async () => {
    account({ _id: ACCOUNT, phone: PHONE, selfPatientId: CHILD });
    const result = await claimProfile({ accountId: String(ACCOUNT), phone: PHONE, relation: 'self', firstName: 'Maria', dateOfBirth: '1990-03-04', now: NOW });
    expect(result).toEqual({ status: 'self_taken' });
  });

  it('a disabled account matches nothing', async () => {
    account({ _id: ACCOUNT, disabled: true });
    expect(await claimProfile({ accountId: String(ACCOUNT), phone: PHONE, relation: 'self', firstName: 'Maria', dateOfBirth: '1990-03-04', now: NOW })).toEqual({ status: 'no_match' });
  });
});
