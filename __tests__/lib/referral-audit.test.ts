import { describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';

const TENANT = new Types.ObjectId('507f1f77bcf86cd799439001');
const REYES = '507f1f77bcf86cd799439041';
const CRUZ = '507f1f77bcf86cd799439042';
const JUAN = '507f1f77bcf86cd799439051';
const VISIT = '507f1f77bcf86cd799439061';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));
const rows = (list: unknown[]) => ({ find: vi.fn(() => ({ select: () => ({ lean: async () => list }) })) });
vi.mock('@/models/Doctor', () => ({
  default: rows([
    { _id: REYES, title: 'Dr.', firstName: 'Ana', lastName: 'Reyes' },
    { _id: CRUZ, title: 'Dra.', firstName: 'Liza', lastName: 'Cruz' },
  ]),
}));
vi.mock('@/models/Patient', () => ({ default: rows([{ _id: JUAN, firstName: 'Juan', lastName: 'Dela Cruz' }]) }));
vi.mock('@/models/Visit', () => ({ default: rows([{ _id: VISIT, visitCode: 'V-0042' }]) }));

const { referralChanges, changedSentence, partiesWords } = await import('@/app/api/referrals/_lib/referral-audit');

const TZ = 'Asia/Manila';
const internal = {
  type: 'doctor_to_doctor',
  referringDoctor: new Types.ObjectId(REYES),
  receivingDoctor: new Types.ObjectId(CRUZ),
  reason: 'Persistent chest pain',
  diagnosis: 'Angina?',
  urgency: 'routine',
  status: 'pending',
  followUpRequired: false,
};

describe('referralChanges', () => {
  it('names doctors instead of their ids', async () => {
    const changes = await referralChanges(TENANT, { ...internal, receivingDoctor: new Types.ObjectId(REYES), referringDoctor: undefined }, internal, ['receivingDoctor'], TZ);
    expect(changes).toEqual([{ field: 'receivingDoctor', oldValue: 'Dr. Ana Reyes', newValue: 'Dra. Liza Cruz' }]);
  });

  it('says clinical text changed without copying it', async () => {
    const changes = await referralChanges(TENANT, internal, { ...internal, diagnosis: 'Unstable angina', reason: 'Persistent chest pain' }, ['diagnosis', 'reason'], TZ);
    expect(changes).toEqual([{ field: 'diagnosis', oldValue: 'Clinical information, not copied to the log', newValue: 'Clinical information, not copied to the log' }]);
  });

  it('reads the direction, urgency and follow-up in words', async () => {
    const out = { ...internal, type: 'external', receivingDoctor: undefined, receivingClinic: 'St. Luke’s', urgency: 'stat', followUpRequired: true, followUpDate: new Date('2026-11-14T12:00:00Z') };
    const changes = await referralChanges(TENANT, internal, out, ['type', 'receivingDoctor', 'receivingClinic', 'urgency', 'followUpRequired', 'followUpDate'], TZ);
    expect(changes).toEqual([
      { field: 'direction', oldValue: 'To a doctor here', newValue: 'To another clinic or specialist' },
      { field: 'receivingDoctor', oldValue: 'Dra. Liza Cruz', newValue: null },
      { field: 'receivingClinic', oldValue: null, newValue: 'St. Luke’s' },
      { field: 'urgency', oldValue: 'Routine', newValue: 'STAT' },
      { field: 'followUpRequired', oldValue: 'Not needed', newValue: 'Needed' },
      { field: 'followUpDate', oldValue: null, newValue: 'Nov 14, 2026' },
    ]);
  });

  it('logs a status change with the date seen in the clinic’s time zone and the visit by its code', async () => {
    // 7 PM UTC on the 29th is already the 30th in Manila.
    const seen = { ...internal, status: 'completed', completedDate: new Date('2026-10-29T19:00:00Z'), visit: new Types.ObjectId(VISIT) };
    const changes = await referralChanges(TENANT, internal, seen, ['status', 'completedDate', 'visit', 'acceptedDate'], TZ);
    expect(changes).toEqual([
      { field: 'status', oldValue: 'Waiting for a reply', newValue: 'Seen' },
      { field: 'completedDate', oldValue: null, newValue: 'Oct 30, 2026' },
      { field: 'visit', oldValue: null, newValue: 'V-0042' },
    ]);
  });

  it('ignores fields that were written but did not change', async () => {
    expect(await referralChanges(TENANT, internal, { ...internal }, ['type', 'reason', 'urgency', 'receivingDoctor'], TZ)).toEqual([]);
  });
});

describe('wording', () => {
  it('lists the changed fields as the form names them', () => {
    expect(
      changedSentence('REF-0012', [
        { field: 'receivingDoctor', oldValue: null, newValue: null },
        { field: 'diagnosis', oldValue: null, newValue: null },
      ])
    ).toBe('Edited referral REF-0012: receiving doctor, diagnosis');
  });

  it('says who a new referral is to or from', async () => {
    expect(await partiesWords(TENANT, internal)).toBe('Referred the patient to Dra. Liza Cruz');
    expect(await partiesWords(TENANT, { type: 'external', receivingClinic: 'St. Luke’s' })).toBe('Referred the patient to St. Luke’s');
    expect(await partiesWords(TENANT, { type: 'external', referringClinic: 'Mercy Clinic' })).toBe('Recorded a referral from Mercy Clinic');
    expect(await partiesWords(TENANT, { type: 'patient_to_patient', referringPatient: new Types.ObjectId(JUAN) })).toBe(
      'Recorded a patient’s recommendation from Juan Dela Cruz'
    );
  });
});
