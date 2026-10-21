import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Patient', () => ({ default: { findById: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: { findOne: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/EmcrAccount', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/models/EmcrAccessRequest', () => ({ default: { updateOne: vi.fn() } }));
vi.mock('@/lib/emcr/notify', () => ({ sendSignInInstructions: vi.fn() }));
vi.mock('@/lib/middleware/rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(null),
  applyAuthRateLimits: vi.fn().mockResolvedValue(null),
  rateLimiters: {},
}));
vi.mock('@/lib/patient-family', async () => {
  const actual = await vi.importActual<any>('@/lib/patient-family');
  return { ...actual, canActFor: vi.fn().mockResolvedValue(false), personRecordIds: vi.fn(async (id: unknown) => [id]) };
});

import { Types } from 'mongoose';
import Patient from '@/models/Patient';
import Tenant from '@/models/Tenant';
import EmcrAccount from '@/models/EmcrAccount';
import EmcrAccessRequest from '@/models/EmcrAccessRequest';
import { sendSignInInstructions } from '@/lib/emcr/notify';
import { issuePatientToken, verifyPatientSession } from '@/app/lib/dal';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { forgetAccountCache } from '@/lib/emcr/account';
import { POST as requestAccess } from '@/app/api/emcr/access-requests/route';

const ACCOUNT = '507f1f77bcf86cd799439011';
const CHILD = '507f1f77bcf86cd799439022';
const SIBLING = '507f1f77bcf86cd799439033';
const STRANGER = '507f1f77bcf86cd799439044';
const TENANT = '507f1f77bcf86cd799439055';
const subject = { _id: CHILD, patientCode: 'P-1', email: 'c@x.y', sessionVersion: 0 };

const selectLean = (value: unknown) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) });

/** Patient.findById: session state for any id; Patient.find: the minors' birth dates. */
function patients() {
  vi.mocked(Patient.findById).mockImplementation((() => selectLean({ active: true, sessionVersion: 0 })) as any);
  vi.mocked(Patient.find).mockReturnValue(
    selectLean([
      { _id: new Types.ObjectId(CHILD), dateOfBirth: new Date('2016-01-01') },
      { _id: new Types.ObjectId(SIBLING), dateOfBirth: new Date('2018-01-01') },
    ]) as any
  );
}

function account(value: unknown) {
  vi.mocked(EmcrAccount.findById).mockReturnValue(selectLean(value) as any);
}

function request(token: string, profile?: string) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (profile) headers['x-patient-profile'] = profile;
  return new NextRequest('http://localhost/api/patients/me', { headers });
}

describe('eMCR token claims', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forgetAccountCache();
    patients();
  });

  it('round-trips acc and rel', async () => {
    account({ _id: ACCOUNT });
    const token = await issuePatientToken(subject, { amr: 'otp', acc: ACCOUNT, rel: 'guardian' });
    expect(await verifyPatientSession(token)).toMatchObject({ patientId: CHILD, acc: ACCOUNT, rel: 'guardian' });
  });

  it('never issues rel without an account', async () => {
    const token = await issuePatientToken(subject, { amr: 'otp', rel: 'guardian' });
    const session = await verifyPatientSession(token);
    expect(session?.rel).toBeUndefined();
  });

  it('ends the session when the account is disabled', async () => {
    account({ _id: ACCOUNT, disabled: true });
    const token = await issuePatientToken(subject, { amr: 'otp', acc: '507f1f77bcf86cd799439099' });
    expect(await verifyPatientSession(token)).toBeNull();
  });
});

describe('guardian-only sessions', () => {
  const links = {
    _id: ACCOUNT,
    dependents: [
      { patientId: new Types.ObjectId(CHILD), source: 'phone_dob' },
      { patientId: new Types.ObjectId(SIBLING), source: 'phone_dob' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    forgetAccountCache();
    patients();
    account(links);
  });

  it('works on the managed record and can switch to another managed record', async () => {
    const token = await issuePatientToken(subject, { amr: 'otp', acc: ACCOUNT, rel: 'guardian' });
    expect((await verifyPatientAuth(request(token)))?.patientId).toBe(CHILD);
    const switched = await verifyPatientAuth(request(token, SIBLING));
    expect(switched).toMatchObject({ patientId: SIBLING, guardianId: CHILD });
  });

  it('refuses credential routes (403), even without the header', async () => {
    const token = await issuePatientToken(subject, { amr: 'otp', acc: ACCOUNT, rel: 'guardian' });
    const req = request(token);
    expect(await verifyPatientAuth(req, { profile: 'refuse' })).toBeNull();
    expect(patientAuthError(req).status).toBe(403);
  });

  it('refuses a record the account does not manage', async () => {
    const token = await issuePatientToken(subject, { amr: 'otp', acc: ACCOUNT, rel: 'guardian' });
    const req = request(token, STRANGER);
    expect(await verifyPatientAuth(req)).toBeNull();
    expect(patientAuthError(req).status).toBe(403);
  });
});

describe('POST /api/emcr/access-requests', () => {
  const body = {
    tenantId: TENANT,
    firstName: 'Maria',
    lastName: 'Santos',
    dateOfBirth: '1990-03-04',
    contactPhone: '09998887777',
  };
  const call = () =>
    requestAccess(new NextRequest('http://localhost/api/emcr/access-requests', { method: 'POST', body: JSON.stringify(body) }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Tenant.findOne).mockReturnValue(selectLean({ name: 'Clinic A' }) as any);
  });

  function records(list: unknown[]) {
    vi.mocked(Patient.find).mockReturnValue({ select: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(list) }) }) } as any);
  }

  it('sends instructions to the phone on the record, never to the number typed in', async () => {
    records([{ _id: new Types.ObjectId(CHILD), firstName: 'Maria', lastName: 'Santos', dateOfBirth: new Date('1990-03-04T00:00:00Z'), phone: '09171234567' }]);
    vi.mocked(sendSignInInstructions).mockResolvedValue({ sms: true, email: false });
    const response = await call();
    expect(response.status).toBe(200);
    expect(sendSignInInstructions).toHaveBeenCalledWith(expect.objectContaining({ phone: '09171234567' }));
    expect(JSON.stringify(vi.mocked(sendSignInInstructions).mock.calls)).not.toContain('9998887777');
    expect(EmcrAccessRequest.updateOne).not.toHaveBeenCalled();
  });

  it('queues a request for the clinic when nothing matches, with the same answer', async () => {
    records([]);
    const response = await call();
    expect(response.status).toBe(200);
    expect(sendSignInInstructions).not.toHaveBeenCalled();
    expect(EmcrAccessRequest.updateOne).toHaveBeenCalledTimes(1);
  });

  it('queues a request when the record has no phone or email to reach', async () => {
    records([{ _id: new Types.ObjectId(CHILD), firstName: 'Maria', lastName: 'Santos', dateOfBirth: new Date('1990-03-04T00:00:00Z') }]);
    await call();
    expect(sendSignInInstructions).not.toHaveBeenCalled();
    const [, update] = vi.mocked(EmcrAccessRequest.updateOne).mock.calls[0] as any[];
    expect(update.$set.patientId).toEqual(new Types.ObjectId(CHILD));
  });
});
