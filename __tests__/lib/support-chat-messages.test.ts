import { describe, it, expect, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/models/User', () => ({
  default: {
    find: vi.fn(() => ({ select: () => ({ populate: () => ({ lean: async () => [] }) }) })),
  },
}));

const { serializeConversations, toChatMessage } = await import('@/app/api/messages/_lib/conversations');

const TENANT = new Types.ObjectId();
const ME = new Types.ObjectId();
const at = new Date('2026-10-30T08:00:00Z');

describe('support threads on the clinic side', () => {
  it('reads a support message as sent by "support"', () => {
    const m = toChatMessage({ _id: new Types.ObjectId(), fromSupport: true, body: 'Hello', createdAt: at, updatedAt: at });
    expect(m.senderId).toBe('support');
    expect(m.body).toBe('Hello');
  });

  it('keeps the sender of a staff message', () => {
    expect(toChatMessage({ _id: new Types.ObjectId(), sender: ME, body: 'Hi', createdAt: at }).senderId).toBe(String(ME));
  });

  it('shows the thread as with MyClinicSoft Support, with support as the preview sender', async () => {
    const [summary] = await serializeConversations(TENANT, String(ME), [
      {
        _id: new Types.ObjectId(),
        kind: 'support',
        members: [{ user: ME, unread: 1 }],
        lastMessage: { body: 'Happy to help', createdAt: at },
        lastMessageAt: at,
      } as any,
    ]);
    expect(summary.other).toEqual({ id: 'support', name: 'MyClinicSoft Support', role: 'Support team' });
    expect(summary.lastMessage).toEqual({ body: 'Happy to help', senderId: 'support', createdAt: at.toISOString() });
    expect(summary.unread).toBe(1);
  });
});
