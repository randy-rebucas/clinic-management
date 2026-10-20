import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: () => unknown) => fn() }));
vi.mock('@/models/Notification', () => ({ default: { insertMany: vi.fn().mockResolvedValue([]) } }));
vi.mock('@/models/User', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/Role', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/PatientMessage', () => ({ default: { insertMany: vi.fn() } }));
vi.mock('@/models/Patient', () => ({ default: { find: vi.fn() } }));
vi.mock('@/lib/push-notifications', () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
  sendPushToUserDevices: vi.fn().mockResolvedValue({ sent: true }),
  sendPushToPatientDevices: vi.fn().mockResolvedValue({ sent: true }),
}));

import Notification from '@/models/Notification';
import User from '@/models/User';
import Role from '@/models/Role';
import Patient from '@/models/Patient';
import PatientMessage from '@/models/PatientMessage';
import { sendPushToUser, sendPushToPatientDevices } from '@/lib/push-notifications';
import { notifyStaff, notifyPatients, resolveStaffAudience } from '@/lib/notify';

const TENANT = '507f1f77bcf86cd799439011';
const U1 = '507f1f77bcf86cd799439021';
const U2 = '507f1f77bcf86cd799439022';
const ME = '507f1f77bcf86cd799439023';

const query = (rows: unknown[]) => {
  const q: any = {};
  for (const m of ['select', 'limit', 'sort']) q[m] = vi.fn().mockReturnValue(q);
  q.lean = vi.fn().mockResolvedValue(rows);
  return q;
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('resolveStaffAudience', () => {
  beforeEach(() => vi.clearAllMocks());

  it('looks people up only among the clinic’s active staff, by id and by role', async () => {
    vi.mocked(Role.find).mockReturnValue(query([{ _id: 'r-doctor' }]) as any);
    vi.mocked(User.find).mockReturnValue(query([{ _id: U1 }, { _id: U2 }, { _id: U1 }]) as any);

    expect(await resolveStaffAudience(TENANT, { userIds: [U1, 'not-an-id'], roles: ['doctor'] })).toEqual([U1, U2]);
    const filter = (vi.mocked(User.find).mock.calls[0] as unknown[])[0] as any;
    expect(String(filter.tenantId)).toBe(TENANT);
    expect(filter.status).toBe('active');
    expect(filter.$or).toHaveLength(2);
  });

  it('returns nobody when no audience is given', async () => {
    expect(await resolveStaffAudience(TENANT, {})).toEqual([]);
    expect(User.find).not.toHaveBeenCalled();
  });

  it('without a clinic only reaches named users who have no clinic (medical reps)', async () => {
    vi.mocked(User.find).mockReturnValue(query([{ _id: U1 }]) as any);
    expect(await resolveStaffAudience(null, { userIds: [U1], allStaff: true })).toEqual([U1]);
    expect(((vi.mocked(User.find).mock.calls[0] as unknown[])[0] as any).$or).toEqual([{ tenantId: null }, { tenantId: { $exists: false } }]);
  });
});

describe('notifyStaff', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes one notification per person with the sender, leaves the sender out, and pushes', async () => {
    vi.mocked(User.find).mockReturnValue(query([{ _id: U1 }, { _id: ME }]) as any);
    const r = await notifyStaff({
      tenantId: TENANT,
      audience: { allStaff: true },
      type: 'message',
      title: 'Staff meeting',
      message: '3pm today',
      sender: { kind: 'staff', userId: ME, name: 'Dr. Reyes' },
      excludeUserId: ME,
    });
    expect(r.recipients).toBe(1);
    const rows = (vi.mocked(Notification.insertMany).mock.calls[0] as unknown[])[0] as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'message', title: 'Staff meeting', sender: { kind: 'staff', name: 'Dr. Reyes' } });
    expect(String(rows[0].user)).toBe(U1);
    await flush();
    expect(sendPushToUser).toHaveBeenCalledWith(U1, expect.objectContaining({ title: 'Staff meeting' }), TENANT);
  });

  it('does not push low-priority notices', async () => {
    vi.mocked(User.find).mockReturnValue(query([{ _id: U1 }]) as any);
    await notifyStaff({ tenantId: TENANT, audience: { userIds: [U1] }, type: 'system', title: 't', message: 'm', priority: 'low', sender: { kind: 'system' } });
    await flush();
    expect(sendPushToUser).not.toHaveBeenCalled();
  });
});

describe('notifyPatients', () => {
  beforeEach(() => vi.clearAllMocks());

  it('only messages active patients of this clinic and pushes each a copy', async () => {
    vi.mocked(Patient.find).mockReturnValue(query([{ _id: U1 }]) as any);
    vi.mocked(PatientMessage.insertMany).mockResolvedValue([{ _id: 'm1', patient: U1 }] as any);
    const r = await notifyPatients({ tenantId: TENANT, patientIds: [U1, U2], title: 'Hi', message: 'Body', sender: { kind: 'staff', name: 'Dr. Reyes' } });
    expect(r.recipients).toBe(1);
    const filter = (vi.mocked(Patient.find).mock.calls[0] as unknown[])[0] as any;
    expect(String(filter.tenantIds)).toBe(TENANT);
    expect(filter.active).toEqual({ $ne: false });
    await flush();
    expect(sendPushToPatientDevices).toHaveBeenCalledWith(U1, expect.objectContaining({ tag: 'message-m1' }), { tenantId: TENANT });
  });
});
