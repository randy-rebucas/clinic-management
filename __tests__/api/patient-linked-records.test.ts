import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn(), find: vi.fn(), updateMany: vi.fn() } }));
vi.mock('@/models/MobileDevice', () => ({ default: {} }));
vi.mock('@/app/lib/dal', () => ({}));
vi.mock('@/app/lib/refresh-tokens', () => ({}));

import Patient from '@/models/Patient';
import { linkRecordsByVerifiedPhone, recordAtClinic } from '@/app/api/patients/me/_lib/linked-records';

const SELF = new Types.ObjectId('507f1f77bcf86cd799439033');
const OTHER = new Types.ObjectId('507f1f77bcf86cd799439044');
const CHILD = new Types.ObjectId('507f1f77bcf86cd799439055');
const DOB = new Date('1990-05-01T00:00:00Z');

const one = (row: unknown) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(row) }) });
const many = (rows: unknown[]) => {
  const q: any = { lean: vi.fn().mockResolvedValue(rows) };
  q.select = vi.fn().mockReturnValue(q);
  q.limit = vi.fn().mockReturnValue(q);
  return q;
};

describe('linkRecordsByVerifiedPhone', () => {
  beforeEach(() => vi.clearAllMocks());

  it("links the same person's record at another clinic, not a family member sharing the phone", async () => {
    vi.mocked(Patient.findById).mockReturnValue(one({ _id: SELF, phone: '09171234567', dateOfBirth: DOB }) as any);
    vi.mocked(Patient.find).mockReturnValue(
      many([
        { _id: OTHER, dateOfBirth: new Date('1990-05-01T00:00:00Z') },
        { _id: CHILD, dateOfBirth: new Date('2015-02-03T00:00:00Z') },
      ])
    );

    await linkRecordsByVerifiedPhone(String(SELF), '+639171234567');

    // Only the patient's own phone field is matched (never an emergency-contact number).
    const findFilter = (vi.mocked(Patient.find).mock.calls as any)[0][0];
    expect(findFilter.phone.$in).toEqual(expect.arrayContaining(['+639171234567', '09171234567']));
    expect(findFilter['contacts.phone']).toBeUndefined();
    expect(Patient.updateMany).toHaveBeenCalledWith({ _id: { $in: [SELF, OTHER] } }, { $set: { accountId: SELF } });
  });

  it('merges into an existing account', async () => {
    const ACCOUNT = new Types.ObjectId('507f1f77bcf86cd799439066');
    vi.mocked(Patient.findById).mockReturnValue(one({ _id: SELF, phone: '09171234567', dateOfBirth: DOB }) as any);
    vi.mocked(Patient.find).mockReturnValue(many([{ _id: OTHER, dateOfBirth: DOB, accountId: ACCOUNT }]));

    await linkRecordsByVerifiedPhone(String(SELF), '09171234567');

    expect(Patient.updateMany).toHaveBeenCalledWith(
      { $or: [{ _id: { $in: [SELF, OTHER] } }, { accountId: { $in: [ACCOUNT] } }] },
      { $set: { accountId: ACCOUNT } }
    );
  });

  it("links nothing when the code was sent to the record's contact number, not its own phone", async () => {
    vi.mocked(Patient.findById).mockReturnValue(one({ _id: SELF, phone: '09998887777', dateOfBirth: DOB }) as any);

    await linkRecordsByVerifiedPhone(String(SELF), '09171234567');

    expect(Patient.find).not.toHaveBeenCalled();
    expect(Patient.updateMany).not.toHaveBeenCalled();
  });
});

describe('recordAtClinic', () => {
  it("picks the linked record registered at the clinic", () => {
    const linked = {
      patientIds: [SELF, OTHER],
      tenantIds: ['a', 'b'],
      records: [
        { _id: SELF, tenantIds: ['a'] },
        { _id: OTHER, tenantIds: ['b'] },
      ],
    };
    expect(recordAtClinic(linked, 'b')).toBe(OTHER);
    expect(recordAtClinic(linked, 'c')).toBeNull();
  });
});
