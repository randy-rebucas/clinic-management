import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/MedicalRepresentative', () => ({ default: { findOneAndUpdate: vi.fn() } }));
vi.mock('@/models/User', () => ({ default: { updateOne: vi.fn() } }));
vi.mock('@/lib/user-invite', () => ({
  generateInviteToken: () => ({ token: 'raw', tokenHash: 'hash', expiresAt: new Date(0) }),
  inviteUpdate: () => ({ inviteTokenHash: 'hash' }),
  sendSetPasswordEmail: vi.fn(),
}));

import MedicalRepresentative from '@/models/MedicalRepresentative';
import User from '@/models/User';
import { sendSetPasswordEmail } from '@/lib/user-invite';
import { sendDeferredRepInvite } from '@/lib/medrep-invite';

function found(rep: unknown) {
  vi.mocked(MedicalRepresentative.findOneAndUpdate).mockReturnValue({ select: () => ({ lean: () => Promise.resolve(rep) }) } as any);
}

describe('sendDeferredRepInvite', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the held invite and clears the flag in the same update', async () => {
    found({ _id: 'r1', userId: 'u1', firstName: 'Ana', lastName: 'Cruz', email: 'ana@example.com' });
    await sendDeferredRepInvite('r1');

    expect(MedicalRepresentative.findOneAndUpdate).toHaveBeenCalledWith({ _id: 'r1', inviteDeferred: true }, { $unset: { inviteDeferred: 1 } });
    expect(User.updateOne).toHaveBeenCalledWith({ _id: 'u1', medicalRepresentativeProfile: 'r1' }, { $set: { inviteTokenHash: 'hash' } });
    expect(sendSetPasswordEmail).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana@example.com', token: 'raw', tenantId: null }));
  });

  it('does nothing for a repeat webhook or a rep invited at creation', async () => {
    found(null);
    await sendDeferredRepInvite('r1');
    expect(User.updateOne).not.toHaveBeenCalled();
    expect(sendSetPasswordEmail).not.toHaveBeenCalled();
  });
});
