import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/sms', () => ({ sendSMS: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock('@/models/Patient', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/models/EmcrAccount', () => ({ default: { updateOne: vi.fn() } }));
vi.mock('@/models/EmcrInvite', () => ({ default: { updateOne: vi.fn(), findOne: vi.fn() } }));
vi.mock('@/app/api/patients/me/_lib/linked-records', () => ({ linkRecordsByVerifiedPhone: vi.fn() }));
vi.mock('@/lib/patient-family', () => ({ addClinicGuardian: vi.fn(), personRecordIds: vi.fn(async (id: unknown) => [id]) }));
vi.mock('@/lib/emcr/account', () => ({ attachSelf: vi.fn(), forgetAccountCache: vi.fn() }));
vi.mock('@/lib/emcr/login-id', () => ({ ensureLoginId: vi.fn() }));

import { Types } from 'mongoose';
import Patient from '@/models/Patient';
import EmcrAccount from '@/models/EmcrAccount';
import EmcrInvite from '@/models/EmcrInvite';
import { addClinicGuardian } from '@/lib/patient-family';
import { attachSelf } from '@/lib/emcr/account';
import {
  findUsableInvite,
  formatInviteCode,
  generateInviteCode,
  hashInviteCode,
  parseInviteCode,
  redeemInvite,
  type InviteLean,
} from '@/lib/emcr/invite';

const TENANT = new Types.ObjectId();
const CHILD = new Types.ObjectId();
const SIBLING = new Types.ObjectId();
const PARENT = new Types.ObjectId();
const PHONE = '+639171234567';

const lean = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) });
const selectLean = (value: unknown) => ({ select: vi.fn().mockReturnValue(lean(value)) });

function invite(overrides: Partial<InviteLean> = {}): InviteLean {
  return {
    _id: new Types.ObjectId(),
    tenantId: TENANT,
    mode: 'guardian',
    patientId: CHILD,
    dependentIds: [SIBLING],
    relationship: 'child',
    phone: PHONE,
    expiresAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  };
}

describe('invite codes', () => {
  it('generates 8 unambiguous characters', () => {
    for (let i = 0; i < 50; i++) expect(generateInviteCode()).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
  });

  it('reads the typed code, the texted link and the app link', () => {
    expect(parseInviteCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(parseInviteCode('https://myclinicsoft.com/i/ABCD2345')).toBe('ABCD2345');
    expect(parseInviteCode('myclinicsoft://invite?c=ABCD2345')).toBe('ABCD2345');
    expect(formatInviteCode('ABCD2345')).toBe('ABCD-2345');
  });

  it('rejects malformed codes', () => {
    expect(parseInviteCode('ABCD234')).toBeNull();
    expect(parseInviteCode('ABCD0345')).toBeNull(); // 0 is not in the alphabet
    expect(parseInviteCode('{"t":"qr"}')).toBeNull();
    expect(parseInviteCode(42)).toBeNull();
  });

  it('treats revoked invites as unknown', async () => {
    vi.mocked(EmcrInvite.findOne).mockReturnValue(lean({ ...invite(), revokedAt: new Date() }) as any);
    expect(await findUsableInvite('ABCD2345')).toEqual({ ok: false, reason: 'invalid' });
    expect(EmcrInvite.findOne).toHaveBeenCalledWith({ codeHash: hashInviteCode('ABCD2345') });
  });

  it('reports used and expired invites', async () => {
    vi.mocked(EmcrInvite.findOne).mockReturnValueOnce(lean({ ...invite(), usedAt: new Date() }) as any);
    expect(await findUsableInvite('ABCD2345')).toEqual({ ok: false, reason: 'used' });
    vi.mocked(EmcrInvite.findOne).mockReturnValueOnce(lean(invite({ expiresAt: new Date(Date.now() - 1000) })) as any);
    expect(await findUsableInvite('ABCD2345')).toEqual({ ok: false, reason: 'expired' });
  });
});

describe('redeemInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(EmcrInvite.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
  });

  it('guardian invite without own record: adds every child as a clinic dependent on the account', async () => {
    vi.mocked(Patient.find).mockReturnValue(selectLean([{ _id: CHILD, phone: PHONE }, { _id: SIBLING, phone: PHONE }]) as any);
    const account = { _id: new Types.ObjectId(), phone: PHONE, dependents: [] };
    expect(await redeemInvite(invite(), account)).toEqual({ ok: true, accountId: account._id });
    const push = (vi.mocked(EmcrAccount.updateOne).mock.calls[0] as any[])[1];
    expect(push.$push.dependents.$each).toEqual([
      expect.objectContaining({ patientId: CHILD, source: 'clinic', tenantId: TENANT, relationship: 'child' }),
      expect.objectContaining({ patientId: SIBLING, source: 'clinic', tenantId: TENANT }),
    ]);
  });

  it('guardian invite with own record: links on the children’s records at this clinic', async () => {
    vi.mocked(Patient.find).mockReturnValue(selectLean([{ _id: CHILD, phone: PHONE }]) as any);
    const account = { _id: new Types.ObjectId(), phone: PHONE, selfPatientId: PARENT };
    await redeemInvite(invite({ dependentIds: [] }), account);
    expect(addClinicGuardian).toHaveBeenCalledWith({ dependentId: CHILD, guardianId: PARENT, tenantId: TENANT, relationship: 'child' });
    expect(EmcrAccount.updateOne).not.toHaveBeenCalled();
  });

  it('self invite: attaches the record as the holder', async () => {
    vi.mocked(Patient.find).mockReturnValue(selectLean([{ _id: PARENT, phone: '09171234567' }]) as any);
    const account = { _id: new Types.ObjectId(), phone: PHONE };
    expect(await redeemInvite(invite({ mode: 'self', patientId: PARENT, dependentIds: [] }), account)).toMatchObject({ ok: true });
    expect(attachSelf).toHaveBeenCalledWith(account._id, PARENT);
  });

  it('self invite: refuses once the clinic changed the record’s phone', async () => {
    vi.mocked(Patient.find).mockReturnValue(selectLean([{ _id: PARENT, phone: '+639189999999' }]) as any);
    const result = await redeemInvite(invite({ mode: 'self', patientId: PARENT }), { _id: new Types.ObjectId(), phone: PHONE });
    expect(result).toEqual({ ok: false, reason: 'record_changed' });
    expect(EmcrInvite.updateOne).not.toHaveBeenCalled();
  });

  it('self invite: refuses an account that already holds someone else', async () => {
    vi.mocked(Patient.find).mockReturnValue(selectLean([{ _id: PARENT, phone: PHONE }]) as any);
    const result = await redeemInvite(invite({ mode: 'self', patientId: PARENT }), {
      _id: new Types.ObjectId(),
      phone: PHONE,
      selfPatientId: new Types.ObjectId(),
    });
    expect(result).toEqual({ ok: false, reason: 'self_taken' });
  });

  it('spends the invite once', async () => {
    vi.mocked(Patient.find).mockReturnValue(selectLean([{ _id: CHILD, phone: PHONE }]) as any);
    vi.mocked(EmcrInvite.updateOne).mockResolvedValue({ modifiedCount: 0 } as any);
    expect(await redeemInvite(invite(), { _id: new Types.ObjectId(), phone: PHONE })).toEqual({ ok: false, reason: 'used' });
    expect(EmcrAccount.updateOne).not.toHaveBeenCalled();
  });
});
