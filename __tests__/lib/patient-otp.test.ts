import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Patient', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/MobileDevice', () => ({ default: {} }));
vi.mock('@/lib/otp', () => ({ consumeOtp: vi.fn(), startOtp: vi.fn() }));

import { Types } from 'mongoose';
import Patient from '@/models/Patient';
import { consumeOtp } from '@/lib/otp';
import { consumePatientOtp } from '@/app/api/patients/auth/shared';

const OWN = new Types.ObjectId('507f1f77bcf86cd799439011');
const SIBLING = new Types.ObjectId('507f1f77bcf86cd799439022');
const TENANT = new Types.ObjectId('507f1f77bcf86cd799439055');
const PHONE = '+639171234567';

describe('consumePatientOtp', () => {
  beforeEach(() => vi.clearAllMocks());

  it('by phone: opens the record the code was sent for, and it must still carry the number', async () => {
    vi.mocked(consumeOtp).mockResolvedValue({ ok: true, phone: PHONE, patientId: OWN });
    vi.mocked(Patient.findOne).mockResolvedValue({ _id: OWN } as any);

    const result = await consumePatientOtp({ phone: '09171234567' }, '123456');

    expect(result).toMatchObject({ ok: true, patient: { _id: OWN } });
    expect(consumeOtp).toHaveBeenCalledWith({ scope: 'patient', phone: PHONE }, '123456');
    const filter = vi.mocked(Patient.findOne).mock.calls[0][0] as any;
    expect(filter._id).toBe(OWN);
    expect(filter.active).toEqual({ $ne: false });
    expect(filter.$or[0].phone.$in).toContain(PHONE);
    // A minor reached through a parent's contact number matches here too.
    expect(filter.$or[1]['contacts.phone'].$in).toContain(PHONE);
  });

  it('by phone: refuses a clinic the record does not belong to', async () => {
    vi.mocked(consumeOtp).mockResolvedValue({ ok: true, phone: PHONE, patientId: OWN });
    vi.mocked(Patient.findOne).mockResolvedValue(null as any);

    expect(await consumePatientOtp({ phone: PHONE, tenantId: TENANT }, '123456')).toEqual({ ok: false, reason: 'invalid' });
    expect((vi.mocked(Patient.findOne).mock.calls[0][0] as any).tenantIds).toBe(TENANT);
  });

  it('by phone: an unroutable number never reaches a check', async () => {
    expect(await consumePatientOtp({ phone: 'abc' }, '123456')).toEqual({ ok: false, reason: 'invalid' });
    expect(consumeOtp).not.toHaveBeenCalled();
  });

  it('by phone: passes the failure through', async () => {
    vi.mocked(consumeOtp).mockResolvedValue({ ok: false, reason: 'locked' });
    expect(await consumePatientOtp({ phone: PHONE }, '123456')).toEqual({ ok: false, reason: 'locked' });
    expect(Patient.findOne).not.toHaveBeenCalled();
  });

  it("by record: a code sent to the record's own phone proves it", async () => {
    vi.mocked(consumeOtp).mockResolvedValue({ ok: true, phone: PHONE, patientId: OWN });
    vi.mocked(Patient.findOne).mockResolvedValue({ _id: OWN, phone: PHONE } as any);

    expect(await consumePatientOtp({ patientId: String(OWN) }, '123456')).toMatchObject({ ok: true });
    expect(consumeOtp).toHaveBeenCalledTimes(1);
    expect(consumeOtp).toHaveBeenCalledWith({ scope: 'patient', phone: PHONE }, '123456');
  });

  it('by record: a code sent to a contact number proves nothing', async () => {
    // A minor with no phone of their own: the code went to the contact number, for this record.
    vi.mocked(Patient.findOne).mockResolvedValue({ _id: OWN, contacts: { phone: PHONE } } as any);

    expect(await consumePatientOtp({ patientId: String(OWN) }, '123456')).toEqual({ ok: false, reason: 'invalid' });
    expect(consumeOtp).not.toHaveBeenCalled();
  });

  it("by record: never looks a challenge up by the record's id", async () => {
    vi.mocked(consumeOtp).mockResolvedValue({ ok: false, reason: 'invalid', noChallenge: true });
    vi.mocked(Patient.findOne).mockResolvedValue({ _id: OWN, phone: '09990000000' } as any);

    await consumePatientOtp({ patientId: String(OWN) }, '123456');

    expect(vi.mocked(consumeOtp).mock.calls.every(([selector]) => !('patientId' in selector))).toBe(true);
  });

  it("by record: on a shared number, accepts a code sent to the record's own phone for a sibling record", async () => {
    vi.mocked(consumeOtp).mockResolvedValue({ ok: true, phone: PHONE, patientId: SIBLING });
    vi.mocked(Patient.findOne).mockResolvedValue({ _id: OWN, phone: '09171234567' } as any);

    const result = await consumePatientOtp({ patientId: String(OWN) }, '123456');

    expect(result).toMatchObject({ ok: true, patient: { _id: OWN } });
    expect(consumeOtp).toHaveBeenLastCalledWith({ scope: 'patient', phone: PHONE }, '123456');
  });

  it('by record: a wrong code fails after one check', async () => {
    vi.mocked(consumeOtp).mockResolvedValue({ ok: false, reason: 'invalid' });
    vi.mocked(Patient.findOne).mockResolvedValue({ _id: OWN, phone: PHONE } as any);

    expect(await consumePatientOtp({ patientId: String(OWN) }, '123456')).toEqual({ ok: false, reason: 'invalid' });
    expect(consumeOtp).toHaveBeenCalledTimes(1);
  });
});
