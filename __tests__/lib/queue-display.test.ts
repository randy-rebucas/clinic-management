import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Queue', () => ({ default: {} }));
vi.mock('@/models/Doctor', () => ({}));
vi.mock('@/models/Room', () => ({}));
vi.mock('@/app/lib/dal', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/clinic-checkin', () => ({ checkInQr: vi.fn() }));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn() }));

import { getSettings } from '@/lib/settings';
import { verifySession } from '@/app/lib/dal';
import { canViewQueueDisplay, initials, NEXT_UP_MAX, NOW_SERVING_MAX, shapeQueueDisplay } from '@/lib/queue-display';
import { shortQueueNumber } from '@/lib/queue-order';

const entry = (n: number, status: string, extra: Record<string, unknown> = {}) => ({
  queueNumber: `W20261104-${String(n).padStart(3, '0')}`,
  patientName: 'Juan Dela Cruz',
  status,
  ...extra,
});

describe('shapeQueueDisplay', () => {
  it('never carries a full name onto the board', () => {
    const data = shapeQueueDisplay([entry(1, 'in-progress'), entry(2, 'waiting')]);
    expect(JSON.stringify(data)).not.toContain('Juan');
    expect(data.nowServing[0].initials).toBe('J. D. C.');
  });

  it('keeps everyone in progress on the board however long the line is', () => {
    const waiting = Array.from({ length: 30 }, (_, i) => entry(i + 1, 'waiting'));
    const data = shapeQueueDisplay([...waiting, entry(99, 'in-progress')]);
    expect(data.nowServing.map((e) => e.number)).toEqual(['W-099']);
    expect(data.nextUp).toHaveLength(NEXT_UP_MAX);
    expect(data.waiting).toBe(30);
  });

  it('keeps call order for the waiting line and puts the latest call first', () => {
    const data = shapeQueueDisplay([
      entry(1, 'in-progress', { startedAt: '2026-11-04T01:00:00Z' }),
      entry(2, 'in-progress', { startedAt: '2026-11-04T02:00:00Z' }),
      entry(5, 'waiting'),
      entry(3, 'waiting'),
    ]);
    expect(data.nowServing.map((e) => e.number)).toEqual(['W-002', 'W-001']);
    expect(data.nextUp.map((e) => e.number)).toEqual(['W-005', 'W-003']);
  });

  it('caps the cards at what fits, latest calls kept', () => {
    const called = Array.from({ length: NOW_SERVING_MAX + 2 }, (_, i) => entry(i + 1, 'in-progress', { startedAt: new Date(2026, 10, 4, 8, i) }));
    const data = shapeQueueDisplay(called);
    expect(data.nowServing).toHaveLength(NOW_SERVING_MAX);
    expect(data.nowServing[0].number).toBe('W-008');
  });

  it('leaves out a room or doctor nobody assigned, and prefers the room name', () => {
    const data = shapeQueueDisplay([
      entry(1, 'waiting'),
      entry(2, 'waiting', { doctor: { lastName: 'Reyes' }, room: { name: 'Room 2', roomNumber: '2' } }),
      entry(3, 'waiting', { room: { roomNumber: '7' } }),
    ]);
    expect(data.nextUp[0]).toMatchObject({ doctor: null, room: null });
    expect(data.nextUp[1]).toMatchObject({ doctor: 'Dr. Reyes', room: 'Room 2' });
    expect(data.nextUp[2].room).toBe('7');
  });
});

describe('initials', () => {
  it('copes with spacing and a missing name', () => {
    expect(initials('  ana   maria ')).toBe('A. M.');
    expect(initials(undefined)).toBe('');
  });
});

describe('shortQueueNumber', () => {
  it('drops the date and leaves anything else alone', () => {
    expect(shortQueueNumber('A20261016-007')).toBe('A-007');
    expect(shortQueueNumber('custom')).toBe('custom');
  });
});

describe('canViewQueueDisplay', () => {
  const tenantId = '507f1f77bcf86cd799439011';
  const set = (publicly: boolean, session: unknown) => {
    vi.mocked(getSettings).mockResolvedValue({ queueSettings: { displayQueuePublicly: publicly } } as never);
    vi.mocked(verifySession).mockResolvedValue(session as never);
  };

  it('is open to anyone once the clinic turns it on', async () => {
    set(true, null);
    await expect(canViewQueueDisplay(tenantId)).resolves.toBe(true);
  });

  it('otherwise needs staff of this clinic', async () => {
    set(false, null);
    await expect(canViewQueueDisplay(tenantId)).resolves.toBe(false);
    set(false, { tenantId: 'another-clinic' });
    await expect(canViewQueueDisplay(tenantId)).resolves.toBe(false);
    set(false, { tenantId });
    await expect(canViewQueueDisplay(tenantId)).resolves.toBe(true);
  });
});
