import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Patient', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Visit', () => ({ default: {} }));
vi.mock('@/models/Prescription', () => ({ default: {} }));
vi.mock('@/models/Tenant', () => ({ default: {} }));
vi.mock('@/models/User', () => ({ default: {} }));
vi.mock('@/models/MobileDevice', () => ({ default: {} }));
vi.mock('@/app/lib/refresh-tokens', () => ({}));

import Patient from '@/models/Patient';
import {
  answersMatch,
  birthDateMatches,
  createSelfQrTicket,
  firstNameMatches,
  lastNameMatches,
  lastVisitMatches,
  normalizePatientCode,
  readSelfQrTicket,
  relationOf,
  selfServeRecords,
} from '@/app/api/patients/auth/self-qr';

const DOCTOR = new Types.ObjectId().toString();
const OTHER_DOCTOR = new Types.ObjectId().toString();
// 2026-10-20 10:00 in Manila.
const VISIT = new Date('2026-10-20T02:00:00Z');

const record = {
  firstName: 'María Clara',
  lastName: 'Dela Cruz',
  dateOfBirth: new Date('2015-03-04T00:00:00Z'),
  patientCode: 'CLINIC-0042',
};
const answers = {
  firstName: 'maria',
  lastName: 'delacruz',
  dateOfBirth: '2015-03-04',
  patientCode: 'clinic 0042',
  lastVisitDate: '2026-10-20',
  doctorId: DOCTOR,
};

describe('answer matching', () => {
  it('ignores case, accents, spaces, dashes and a middle name', () => {
    expect(firstNameMatches('MARIA', 'María Clara')).toBe(true);
    expect(firstNameMatches('Maria Clara', 'María Clara')).toBe(true);
    expect(firstNameMatches('Mario', 'María')).toBe(false);
    expect(lastNameMatches('dela-cruz', 'Dela Cruz')).toBe(true);
    expect(lastNameMatches('Cruz', 'Dela Cruz')).toBe(false);
    expect(normalizePatientCode(' clinic-0042 ')).toBe('CLINIC0042');
  });

  it('matches the birth date exactly', () => {
    expect(birthDateMatches('2015-03-04', record.dateOfBirth)).toBe(true);
    expect(birthDateMatches('2015-03-05', record.dateOfBirth)).toBe(false);
    expect(birthDateMatches('03/04/2015', record.dateOfBirth)).toBe(false);
  });

  it('matches the last visit within a day, with the same doctor', () => {
    const events = [{ date: VISIT, providerId: DOCTOR }];
    expect(lastVisitMatches(events, '2026-10-20', DOCTOR)).toBe(true);
    expect(lastVisitMatches(events, '2026-10-21', DOCTOR)).toBe(true);
    expect(lastVisitMatches(events, '2026-10-22', DOCTOR)).toBe(false);
    expect(lastVisitMatches(events, '2026-10-20', OTHER_DOCTOR)).toBe(false);
    expect(lastVisitMatches([], '2026-10-20', DOCTOR)).toBe(false);
  });

  it('needs every answer to match', () => {
    const events = [{ date: VISIT, providerId: DOCTOR }];
    expect(answersMatch(record, events, answers)).toBe(true);
    expect(answersMatch(record, events, { ...answers, patientCode: 'CLINIC-0043' })).toBe(false);
    expect(answersMatch(record, events, { ...answers, doctorId: OTHER_DOCTOR })).toBe(false);
    expect(answersMatch(record, events, { ...answers, dateOfBirth: '2015-04-03' })).toBe(false);
  });

  it('skips the patient code when the record has none', () => {
    const events = [{ date: VISIT, providerId: DOCTOR }];
    expect(answersMatch({ ...record, patientCode: undefined }, events, { ...answers, patientCode: undefined })).toBe(true);
  });
});

describe('ticket', () => {
  it('round-trips the phone and clinic', () => {
    const tenantId = new Types.ObjectId().toString();
    expect(readSelfQrTicket(createSelfQrTicket('+639171234567', tenantId).token)).toEqual({ phone: '+639171234567', tenantId });
    expect(readSelfQrTicket(createSelfQrTicket('+639171234567').token)).toEqual({ phone: '+639171234567' });
  });

  it('rejects tampered, foreign and expired tickets', () => {
    const { token } = createSelfQrTicket('+639171234567');
    expect(readSelfQrTicket(`${token}x`)).toBeNull();
    expect(readSelfQrTicket('nonsense')).toBeNull();
    expect(readSelfQrTicket(123)).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    expect(readSelfQrTicket(token)).toBeNull();
    vi.useRealTimers();
  });
});

describe('selfServeRecords', () => {
  const chain = (rows: unknown[]) => ({
    select: () => ({ sort: () => ({ limit: () => ({ lean: () => Promise.resolve(rows) }) }) }),
  });
  const adult = (phone?: string) => ({ _id: new Types.ObjectId(), phone, dateOfBirth: new Date('1985-01-01') });
  const child = { _id: new Types.ObjectId(), phone: undefined, dateOfBirth: new Date('2018-01-01') };

  beforeEach(() => vi.mocked(Patient.find).mockReset());

  it('lists the adult whose own number it is and minors on it, never another adult', async () => {
    const own = adult('09171234567');
    const otherAdult = adult('09998887777'); // reached through contacts.phone only
    vi.mocked(Patient.find).mockReturnValue(chain([own, child, otherAdult]) as any);

    const rows = await selfServeRecords('+639171234567');
    expect(rows.map((r) => String(r._id))).toEqual([String(own._id), String(child._id)]);
    expect(relationOf(own)).toBe('self');
    expect(relationOf(child)).toBe('child');
  });

  it('limits the search to the kiosk clinic', async () => {
    vi.mocked(Patient.find).mockReturnValue(chain([]) as any);
    const tenantId = new Types.ObjectId().toString();
    await selfServeRecords('+639171234567', tenantId);
    const filter = (vi.mocked(Patient.find).mock.calls as unknown[][])[0][0] as Record<string, unknown>;
    expect(String(filter.tenantIds)).toBe(tenantId);
  });
});
