import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/EmcrAccount', () => ({ default: { findById: vi.fn(), find: vi.fn(), updateOne: vi.fn() } }));
vi.mock('@/models/Patient', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: { find: vi.fn() } }));
vi.mock('@/lib/patient-family', () => ({ personRecordIds: vi.fn(async (id: unknown) => [id]) }));

import { Types } from 'mongoose';
import EmcrAccount from '@/models/EmcrAccount';
import Patient from '@/models/Patient';
import Tenant from '@/models/Tenant';
import {
  baseLoginId,
  ensureLoginId,
  fullLoginId,
  nextFreeLoginId,
  parseLoginId,
  patientInitials,
} from '@/lib/emcr/login-id';

const ACCOUNT = new Types.ObjectId();
const SELF = new Types.ObjectId();
const CLINIC = new Types.ObjectId();
const lean = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) });
const selectLean = (value: unknown) => ({ select: vi.fn().mockReturnValue(lean(value)) });

describe('login ID format', () => {
  it('takes the first letter of every name word, without accents', () => {
    expect(patientInitials('Juan', 'Dela Cruz')).toBe('jdc');
    expect(patientInitials('Ma. Clara', 'Santos')).toBe('mcs');
    expect(patientInitials('José Ñino', 'Peña')).toBe('jnp');
    expect(patientInitials('Ana Maria Luisa', 'De los Reyes')).toBe('amld');
  });

  it('builds <location>.<initials>.<YYYYMMDD>', () => {
    expect(baseLoginId('qc01', { firstName: 'Juan', lastName: 'Dela Cruz', dateOfBirth: new Date('1990-04-25T00:00:00Z') })).toBe(
      'qc01.jdc.19900425'
    );
    expect(baseLoginId(undefined, { firstName: 'Juan', lastName: 'Cruz', dateOfBirth: new Date('1990-04-25') })).toBeNull();
    expect(baseLoginId('qc01', { firstName: 'Juan', lastName: 'Cruz' })).toBeNull();
  });

  it('adds a tie-breaker for a second person with the same parts', () => {
    expect(nextFreeLoginId('qc01.jdc.19900425', [])).toBe('qc01.jdc.19900425');
    expect(nextFreeLoginId('qc01.jdc.19900425', ['qc01.jdc.19900425'])).toBe('qc01.jdc.19900425.2');
    expect(nextFreeLoginId('qc01.jdc.19900425', ['qc01.jdc.19900425', 'qc01.jdc.19900425.2'])).toBe('qc01.jdc.19900425.3');
  });

  it('reads only IDs on the eMCR domain', () => {
    expect(parseLoginId(' QC01.JDC.19900425@MyClinicSoft.Solutions ')).toBe('qc01.jdc.19900425');
    expect(parseLoginId('qc01.jdc.19900425.2@myclinicsoft.solutions')).toBe('qc01.jdc.19900425.2');
    expect(parseLoginId('qc01.jdc.19900425@gmail.com')).toBeNull();
    expect(parseLoginId('juan@myclinicsoft.solutions')).toBeNull();
    expect(fullLoginId('qc01.jdc.19900425')).toBe('qc01.jdc.19900425@myclinicsoft.solutions');
  });
});

describe('ensureLoginId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Patient.find).mockReturnValue(
      selectLean([{ _id: SELF, firstName: 'Juan', lastName: 'Dela Cruz', dateOfBirth: new Date('1990-04-25T00:00:00Z'), tenantIds: [CLINIC] }]) as any
    );
    vi.mocked(Tenant.find).mockReturnValue(selectLean([{ _id: CLINIC, locationCode: 'qc01' }]) as any);
    vi.mocked(EmcrAccount.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);
  });

  it('keeps an ID already given', async () => {
    vi.mocked(EmcrAccount.findById).mockReturnValue(selectLean({ _id: ACCOUNT, loginId: 'mk02.jdc.19900425', selfPatientId: SELF }) as any);
    expect(await ensureLoginId(ACCOUNT)).toBe('mk02.jdc.19900425');
    expect(EmcrAccount.updateOne).not.toHaveBeenCalled();
  });

  it('gives none to a guardian-only account', async () => {
    vi.mocked(EmcrAccount.findById).mockReturnValue(selectLean({ _id: ACCOUNT }) as any);
    expect(await ensureLoginId(ACCOUNT)).toBeNull();
  });

  it('gives none while no clinic of the person has a location code', async () => {
    vi.mocked(EmcrAccount.findById).mockReturnValue(selectLean({ _id: ACCOUNT, selfPatientId: SELF }) as any);
    vi.mocked(Tenant.find).mockReturnValue(selectLean([]) as any);
    expect(await ensureLoginId(ACCOUNT)).toBeNull();
  });

  it('takes the next free tie-breaker', async () => {
    vi.mocked(EmcrAccount.findById).mockReturnValue(selectLean({ _id: ACCOUNT, selfPatientId: SELF }) as any);
    vi.mocked(EmcrAccount.find).mockReturnValue(selectLean([{ loginId: 'qc01.jdc.19900425' }]) as any);
    expect(await ensureLoginId(ACCOUNT)).toBe('qc01.jdc.19900425.2');
    expect((vi.mocked(EmcrAccount.updateOne).mock.calls[0] as any[])[1]).toEqual({ $set: { loginId: 'qc01.jdc.19900425.2' } });
  });

  it('retries when another account took the same ID at the same moment', async () => {
    vi.mocked(EmcrAccount.findById).mockReturnValue(selectLean({ _id: ACCOUNT, selfPatientId: SELF }) as any);
    vi.mocked(EmcrAccount.find)
      .mockReturnValueOnce(selectLean([]) as any)
      .mockReturnValueOnce(selectLean([{ loginId: 'qc01.jdc.19900425' }]) as any);
    vi.mocked(EmcrAccount.updateOne).mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
    expect(await ensureLoginId(ACCOUNT)).toBe('qc01.jdc.19900425.2');
  });
});
