import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/app/api/medical-representatives/_lib/rep-session', () => ({
  requireRepSession: vi.fn(),
  isRepSessionError: () => false,
}));
vi.mock('@/models/SupportRequest', () => ({ default: { exists: vi.fn() } }));
vi.mock('@/lib/support', async () => {
  const { z } = await import('zod');
  return {
    ReplySchema: z.object({ message: z.string().trim().min(1).max(10000) }),
    addSupportReply: vi.fn(),
  };
});

import { Types } from 'mongoose';
import { requireRepSession } from '@/app/api/medical-representatives/_lib/rep-session';
import SupportRequestModel from '@/models/SupportRequest';
import { addSupportReply } from '@/lib/support';
import { POST } from '@/app/api/medical-representatives/support/[id]/replies/route';

const USER = new Types.ObjectId('507f1f77bcf86cd7994390aa');
const REP = { userObjectId: USER, ownerFilter: { userId: USER }, session: { email: 'rep@example.com' } } as any;
const ID = '507f1f77bcf86cd7994390ee';

const post = (body: unknown, id = ID) =>
  POST(new NextRequest(`http://x/api/medical-representatives/support/${id}/replies`, { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

describe('POST /api/medical-representatives/support/[id]/replies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRepSession).mockResolvedValue(REP);
    vi.mocked(SupportRequestModel.exists).mockResolvedValue({ _id: ID } as any);
    vi.mocked(addSupportReply).mockResolvedValue({ status: 'open' });
  });

  it('adds the reply as the requester, from the rep’s own email', async () => {
    const res = await post({ message: '  Still broken on my phone.  ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { status: 'open' } });
    expect(addSupportReply).toHaveBeenCalledWith(
      expect.objectContaining({ id: ID, authorType: 'requester', authorEmail: 'rep@example.com', message: 'Still broken on my phone.' })
    );
  });

  it('only finds the rep’s own request', async () => {
    await post({ message: 'Hi' });
    expect(vi.mocked(SupportRequestModel.exists).mock.calls[0][0]).toEqual({ _id: ID, userId: USER });
  });

  it('answers 404 for someone else’s request and adds nothing', async () => {
    vi.mocked(SupportRequestModel.exists).mockResolvedValue(null);
    expect((await post({ message: 'Hi' })).status).toBe(404);
    expect(addSupportReply).not.toHaveBeenCalled();
  });

  it('refuses an empty message and a malformed id', async () => {
    expect((await post({ message: '   ' })).status).toBe(400);
    expect((await post({ message: 'Hi' }, 'nope')).status).toBe(404);
    expect(addSupportReply).not.toHaveBeenCalled();
  });
});
