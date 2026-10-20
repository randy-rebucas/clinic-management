import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));
vi.mock('@/lib/api/tenant-session', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/tenant-session')>()),
  requireTenantSession: vi.fn(),
}));
vi.mock('@/app/lib/auth-helpers', () => ({
  refuseAccess: vi.fn(async () => NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })),
  requirePermission: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/notify', () => ({
  STAFF_SENDER_ROLES: ['admin', 'owner', 'doctor'],
  MAX_STAFF_RECIPIENTS: 500,
  notifyStaff: vi.fn().mockResolvedValue({ recipients: 3, batchId: 'b1' }),
  notifyPatients: vi.fn().mockResolvedValue({ recipients: 1, batchId: 'b2', messageIds: ['m1'] }),
}));
vi.mock('@/models/User', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/models/Patient', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/PatientMessage', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Notification', () => ({ default: {} }));
vi.mock('@/app/api/notifications/_lib/scope', () => ({ requireNotificationScope: vi.fn(), isNotificationScopeError: vi.fn() }));
vi.mock('@/lib/platform-auth', () => ({ requirePlatformApi: vi.fn(), isPlatformError: (v: unknown) => v instanceof NextResponse }));
vi.mock('@/models/Tenant', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/PlatformAnnouncement', () => ({ default: { create: vi.fn().mockResolvedValue({ _id: 'a1' }) } }));

import { Types } from 'mongoose';
import { requireTenantSession } from '@/lib/api/tenant-session';
import { requirePlatformApi } from '@/lib/platform-auth';
import { notifyStaff, notifyPatients } from '@/lib/notify';
import User from '@/models/User';
import Patient from '@/models/Patient';
import Tenant from '@/models/Tenant';
import { POST as sendStaff } from '@/app/api/notifications/route';
import { POST as messagePatient } from '@/app/api/patients/[id]/messages/route';
import { POST as platformSend } from '@/app/api/platform/notifications/route';

const TENANT = '507f1f77bcf86cd799439011';
const PATIENT = '507f1f77bcf86cd799439033';
const USER = '507f1f77bcf86cd799439044';

const lean = (v: unknown) => ({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(v) }) });
const json = (url: string, body: unknown) => new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

function signedInAs(role: string) {
  vi.mocked(requireTenantSession).mockResolvedValue({
    session: { userId: USER, email: 'me@clinic.test', role } as any,
    tenantId: TENANT,
    tenantObjectId: new Types.ObjectId(TENANT),
  });
}

describe('staff → staff notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(User.findById).mockReturnValue(lean({ name: 'Ana Reyes' }) as any);
  });

  it('lets a doctor notify colleagues, naming them as the sender and leaving them out', async () => {
    signedInAs('doctor');
    const res = await sendStaff(json('http://x/api/notifications', { roles: ['nurse'], title: 'Room 2', message: 'Needs cleaning' }));
    expect(res.status).toBe(201);
    expect(notifyStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        type: 'message',
        audience: expect.objectContaining({ roles: ['nurse'] }),
        sender: { kind: 'staff', userId: USER, name: 'Ana Reyes' },
        excludeUserId: USER,
      })
    );
  });

  it('refuses nurses and receptionists', async () => {
    for (const role of ['nurse', 'receptionist']) {
      signedInAs(role);
      const res = await sendStaff(json('http://x/api/notifications', { allStaff: true, title: 't', message: 'm' }));
      expect(res.status).toBe(403);
    }
    expect(notifyStaff).not.toHaveBeenCalled();
  });

  it('needs at least one recipient', async () => {
    signedInAs('admin');
    const res = await sendStaff(json('http://x/api/notifications', { title: 't', message: 'm' }));
    expect(res.status).toBe(400);
  });
});

describe('doctor → patient messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(User.findById).mockReturnValue(lean({ name: 'Ana Reyes' }) as any);
    vi.mocked(Patient.findOne).mockReturnValue(lean({ _id: PATIENT, active: true }) as any);
  });
  const params = { params: Promise.resolve({ id: PATIENT }) };

  it('sends from the doctor, by name, to a patient of this clinic', async () => {
    signedInAs('doctor');
    const res = await messagePatient(json(`http://x/api/patients/${PATIENT}/messages`, { title: 'Follow-up', message: 'Come in fasting.' }), params);
    expect(res.status).toBe(201);
    expect(notifyPatients).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, patientIds: [PATIENT], sender: expect.objectContaining({ kind: 'staff', name: 'Dr. Ana Reyes' }) })
    );
    const filter = (vi.mocked(Patient.findOne).mock.calls[0] as unknown[])[0] as any;
    expect(String(filter.tenantIds)).toBe(TENANT);
  });

  it('refuses receptionists, unknown patients and inactive records', async () => {
    signedInAs('receptionist');
    expect((await messagePatient(json('http://x', { title: 't', message: 'm' }), params)).status).toBe(403);

    signedInAs('doctor');
    vi.mocked(Patient.findOne).mockReturnValue(lean(null) as any);
    expect((await messagePatient(json('http://x', { title: 't', message: 'm' }), params)).status).toBe(404);

    vi.mocked(Patient.findOne).mockReturnValue(lean({ _id: PATIENT, active: false }) as any);
    expect((await messagePatient(json('http://x', { title: 't', message: 'm' }), params)).status).toBe(409);
    expect(notifyPatients).not.toHaveBeenCalled();
  });
});

describe('platform → clinic announcements', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs a platform session', async () => {
    vi.mocked(requirePlatformApi).mockResolvedValue(NextResponse.json({ success: false }, { status: 401 }));
    const res = await platformSend(json('http://x', { title: 't', message: 'm', audience: 'admins' }));
    expect(res.status).toBe(401);
  });

  it('notifies the admins of every active clinic as MyClinicSoft', async () => {
    vi.mocked(requirePlatformApi).mockResolvedValue({ email: 'ops@myclinicsoft.test' });
    vi.mocked(Tenant.find).mockReturnValue({ select: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: new Types.ObjectId(TENANT) }, { _id: new Types.ObjectId() }]) }) }) } as any);
    const res = await platformSend(json('http://x', { title: 'Maintenance', message: 'Sunday 2am', audience: 'admins' }));
    expect(res.status).toBe(201);
    expect((await res.json()).data).toMatchObject({ clinics: 2, recipients: 6 });
    expect(notifyStaff).toHaveBeenCalledTimes(2);
    expect(notifyStaff).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'announcement', audience: { roles: ['admin', 'owner'] }, sender: { kind: 'platform', name: 'MyClinicSoft' } })
    );
    expect(((vi.mocked(Tenant.find).mock.calls[0] as unknown[])[0] as any).status).toBe('active');
  });
});
