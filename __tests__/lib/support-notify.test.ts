import { describe, it, expect, beforeEach, vi } from 'vitest';
// Route work handed to after() runs inline: there is no request scope in unit tests.
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: () => unknown) => fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn().mockResolvedValue({ success: true }), escapeHtml: (s: string) => s }));
vi.mock('@/lib/platform-auth', () => ({ platformAdminEmails: () => ['ops@myclinicsoft.test'] }));
vi.mock('@/lib/platform-console', () => ({ supportReference: (id: string) => `SR-${id.slice(-6)}` }));
vi.mock('@/lib/notify', () => ({ notifyStaff: vi.fn().mockResolvedValue({ recipients: 1, batchId: 'b' }) }));
vi.mock('@/models/SupportRequest', () => ({ default: { findOne: vi.fn(), updateOne: vi.fn() } }));

import SupportRequest from '@/models/SupportRequest';
import { notifyStaff } from '@/lib/notify';
import { addSupportReply } from '@/lib/support';

const ID = '507f1f77bcf86cd799439055';
const TENANT = '507f1f77bcf86cd799439011';
const USER = '507f1f77bcf86cd799439044';

function ticket(t: Record<string, unknown>) {
  vi.mocked(SupportRequest.findOne).mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(t) }) } as any);
}

describe('support replies notify the requester in the app', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a clinic requester gets a notification that opens the request', async () => {
    ticket({ status: 'open', email: 'admin@clinic.test', subject: 'Cannot print', tenantId: TENANT, userId: USER });
    await addSupportReply({ id: ID, authorType: 'platform', authorEmail: 'ops@myclinicsoft.test', message: 'Try again now.' });
    expect(notifyStaff).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        audience: { userIds: [USER] },
        type: 'support',
        actionUrl: `/admin/support/${ID}`,
        sender: { kind: 'support', name: 'MyClinicSoft support' },
      })
    );
  });

  it('a medical rep (no clinic) gets one without a web link', async () => {
    ticket({ status: 'open', email: 'rep@pharma.test', subject: 'Login', userId: USER });
    await addSupportReply({ id: ID, authorType: 'platform', authorEmail: 'ops@myclinicsoft.test', message: 'Fixed.' });
    expect(notifyStaff).toHaveBeenCalledWith(expect.objectContaining({ tenantId: null, actionUrl: undefined }));
  });

  it('a requester’s own reply does not notify them', async () => {
    ticket({ status: 'open', email: 'admin@clinic.test', subject: 'Cannot print', tenantId: TENANT, userId: USER });
    await addSupportReply({ id: ID, authorType: 'requester', authorEmail: 'admin@clinic.test', message: 'Still broken', tenantId: TENANT });
    expect(notifyStaff).not.toHaveBeenCalled();
  });
});
