import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
// Route work handed to after() runs inline: there is no request scope in unit tests.
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: () => unknown) => fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn().mockResolvedValue({ success: true }), escapeHtml: (s: string) => s }));
vi.mock('@/lib/platform-auth', () => ({ platformAdminEmails: () => ['ops@myclinicsoft.test'] }));
vi.mock('@/lib/notify', () => ({ notifyStaff: vi.fn() }));
vi.mock('@/lib/push-notifications', () => ({ sendPushToUserDevices: vi.fn().mockResolvedValue({ sent: true }) }));
vi.mock('@/models/MedicalRepresentative', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/SupportRequest', () => ({ default: { findOne: vi.fn(), updateOne: vi.fn(), create: vi.fn() } }));
vi.mock('@/app/api/medical-representatives/_lib/rep-session', () => ({
  requireRepSession: vi.fn(),
  isRepSessionError: () => false,
}));

import { Types } from 'mongoose';
import SupportRequest from '@/models/SupportRequest';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import { notifyStaff } from '@/lib/notify';
import { sendPushToUserDevices } from '@/lib/push-notifications';
import { sendEmail } from '@/lib/email';
import { requireRepSession } from '@/app/api/medical-representatives/_lib/rep-session';
import { addSupportReply, notifyRequesterInApp } from '@/lib/support';
import { POST as createRequest } from '@/app/api/medical-representatives/support/route';

const ID = '507f1f77bcf86cd799439055';
const TENANT = '507f1f77bcf86cd799439011';
const USER = '507f1f77bcf86cd799439044';

const ticket = (t: Record<string, unknown>) =>
  vi.mocked(SupportRequest.findOne).mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(t) }) } as any);
const repProfile = (p: Record<string, unknown> | null) =>
  vi.mocked(MedicalRepresentative.findOne).mockReturnValue({ select: () => ({ lean: async () => p }) } as any);

describe('support notifications to medical reps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notifyStaff).mockResolvedValue({ recipients: 1, batchId: 'b1' });
    repProfile({ notificationsEnabled: true });
  });

  it('a reply to a rep request pushes to the app’s Support screen, not the staff push', async () => {
    ticket({ status: 'open', email: 'rep@pharma.test', subject: 'Login', userId: USER, source: 'medical-rep' });
    await addSupportReply({ id: ID, authorType: 'platform', authorEmail: 'ops@myclinicsoft.test', message: 'Fixed.' });
    await vi.waitFor(() => expect(sendPushToUserDevices).toHaveBeenCalled());

    expect(notifyStaff).toHaveBeenCalledWith(expect.objectContaining({ tenantId: null, audience: { userIds: [USER] }, type: 'support', push: false }));
    expect(sendPushToUserDevices).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ title: 'Support replied: Login', body: 'Fixed.', tag: 'notification-b1', data: { screen: 'support', id: ID } }),
      { honorQuietHours: true }
    );
    expect(vi.mocked(MedicalRepresentative.findOne).mock.calls[0][0]).toEqual({ userId: USER });
  });

  it('“resolved” (and older requests with no source and no clinic) take the same route', async () => {
    await notifyRequesterInApp({ userId: USER }, ID, 'Resolved: Login', 'Marked resolved.');
    await vi.waitFor(() => expect(sendPushToUserDevices).toHaveBeenCalled());
    expect(vi.mocked(sendPushToUserDevices).mock.calls[0][1].data).toEqual({ screen: 'support', id: ID });
  });

  it('skips the push for a rep who switched notifications off, but keeps the in-app notification', async () => {
    repProfile({ notificationsEnabled: false });
    await notifyRequesterInApp({ userId: USER, source: 'medical-rep' }, ID, 'Resolved: Login', 'Marked resolved.');
    await vi.waitFor(() => expect(MedicalRepresentative.findOne).toHaveBeenCalled());
    expect(notifyStaff).toHaveBeenCalledTimes(1);
    expect(sendPushToUserDevices).not.toHaveBeenCalled();
  });

  it('pushes nothing when the in-app notification reached no one', async () => {
    vi.mocked(notifyStaff).mockResolvedValue({ recipients: 0, batchId: 'b0' });
    await notifyRequesterInApp({ userId: USER, source: 'medical-rep' }, ID, 'Resolved: Login', 'Marked resolved.');
    expect(MedicalRepresentative.findOne).not.toHaveBeenCalled();
    expect(sendPushToUserDevices).not.toHaveBeenCalled();
  });

  it('clinic staff keep the staff push (no push:false, no rep push)', async () => {
    await notifyRequesterInApp({ userId: USER, tenantId: TENANT, source: 'clinic' }, ID, 'Resolved: Print', 'Marked resolved.');
    const opts = vi.mocked(notifyStaff).mock.calls[0][0];
    expect(opts).toMatchObject({ tenantId: TENANT, actionUrl: `/admin/support/${ID}` });
    expect(opts).not.toHaveProperty('push');
    expect(sendPushToUserDevices).not.toHaveBeenCalled();
  });
});

describe('POST /api/medical-representatives/support', () => {
  const REQ_ID = new Types.ObjectId('507f1f77bcf86cd7994390ab');
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRepSession).mockResolvedValue({ ownerFilter: { userId: new Types.ObjectId(USER) }, session: { email: 'rep@pharma.test', userId: USER } } as any);
    vi.mocked(SupportRequest.create).mockResolvedValue({ _id: REQ_ID } as any);
  });

  it('answers the same short reference as emails and the console, and tells the platform team list', async () => {
    const res = await createRequest(
      new NextRequest('http://x/api/medical-representatives/support', {
        method: 'POST',
        body: JSON.stringify({ subject: 'Cannot book', message: 'The slot list is empty.', category: 'technical' }),
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).reference).toBe('SR-4390AB');
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalled());
    const mail = vi.mocked(sendEmail).mock.calls[0][0] as any;
    expect(mail.to).toEqual(['ops@myclinicsoft.test']);
    expect(mail.subject).toBe('New support request SR-4390AB: Cannot book');
  });
});
