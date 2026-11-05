import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Queue', () => ({ default: { find: vi.fn(), aggregate: vi.fn() } }));
vi.mock('@/models/Doctor', () => ({}));
vi.mock('@/models/Room', () => ({}));
vi.mock('@/app/lib/dal', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/clinic-checkin', () => ({ checkInQr: vi.fn() }));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn() }));
vi.mock('@/lib/clinic-timezone', () => ({ getTenantTimezone: vi.fn(async () => 'Asia/Manila') }));

import { getSettings } from '@/lib/settings';
import { verifySession } from '@/app/lib/dal';
import Queue from '@/models/Queue';
import {
  boardName,
  canViewQueueDisplay,
  DOCTOR_LINES_MAX,
  isClosedNow,
  loadQueueDisplay,
  NEXT_UP_MAX,
  NOW_SERVING_MAX,
  shapeQueueDisplay,
} from '@/lib/queue-display';
import { shortQueueNumber } from '@/lib/queue-order';

const entry = (n: number, status: string, extra: Record<string, unknown> = {}) => ({
  queueNumber: `W20261104-${String(n).padStart(3, '0')}`,
  patient: { firstName: 'Juan', lastName: 'Dela Cruz' },
  patientName: 'Juan Dela Cruz',
  status,
  ...extra,
});

describe('shapeQueueDisplay', () => {
  it('keeps a patient at the lab off the board', () => {
    const data = shapeQueueDisplay([entry(1, 'away'), entry(2, 'waiting')]);
    expect(data.nowServing).toHaveLength(0);
    expect(data.nextUp.map((e) => e.number)).toEqual(['W-002']);
    expect(data.waiting).toBe(1);
  });

  it('never carries a surname onto the board', () => {
    const data = shapeQueueDisplay([entry(1, 'in-progress'), entry(2, 'waiting')]);
    expect(JSON.stringify(data)).not.toMatch(/Dela|Cruz/);
    expect(data.nowServing[0].name).toBe('Juan D.');
    expect(data.nextUp[0].name).toBe('Juan D.');
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

describe('boardName', () => {
  it('keeps a two-word first name and takes the surname from its first word', () => {
    expect(boardName({ firstName: 'Maria Clara', lastName: 'Santos' })).toBe('Maria Clara S.');
    expect(boardName({ firstName: 'Juan', lastName: 'dela Cruz' })).toBe('Juan D.');
  });

  it('prefers the patient record over the cached name', () => {
    expect(boardName({ firstName: 'Ana', lastName: 'Lim' }, 'Old Name')).toBe('Ana L.');
  });

  it('falls back to the cached name when the record is missing', () => {
    expect(boardName(null, 'Pedro Reyes')).toBe('Pedro R.');
    expect(boardName(null, 'Maria Clara Santos')).toBe('Maria S.');
  });

  it('copes with spacing, a single name and no name at all', () => {
    expect(boardName(null, '  ana   lim ')).toBe('ana L.');
    expect(boardName(null, 'Cher')).toBe('Cher');
    expect(boardName({ firstName: 'Cher', lastName: ' ' })).toBe('Cher');
    expect(boardName(null, undefined)).toBe('');
  });

  it('follows the clinic setting', () => {
    const juan = { firstName: 'Juan', lastName: 'Dela Cruz' };
    expect(boardName(juan, null, 'initials')).toBe('J. D.');
    expect(boardName(juan, 'Juan Dela Cruz', 'number')).toBe('');
  });
});

describe('shapeQueueDisplay options', () => {
  it('leaves names off the feed altogether for number-only clinics', () => {
    const data = shapeQueueDisplay([entry(1, 'in-progress'), entry(2, 'waiting')], { names: 'number', byDoctor: true });
    expect(JSON.stringify(data)).not.toMatch(/Juan|"J\./);
    expect(data.nextUp[0].name).toBe('');
  });

  it('carries the call time and the wait', () => {
    const waitingEntry = entry(2, 'waiting');
    const data = shapeQueueDisplay([entry(1, 'in-progress', { startedAt: '2026-11-04T01:00:00Z' }), waitingEntry], {
      waits: new Map([[waitingEntry, { estimatedWaitTime: 15 }]]),
    });
    expect(data.nowServing[0]).toMatchObject({ calledAt: Date.parse('2026-11-04T01:00:00Z'), waitMinutes: null });
    expect(data.nextUp[0]).toMatchObject({ calledAt: null, waitMinutes: 15 });
  });

  it('builds no doctor lines unless asked', () => {
    expect(shapeQueueDisplay([entry(1, 'waiting')]).lines).toBeNull();
  });

  it('groups by doctor, latest call first, with the unassigned line last', () => {
    const ana = { _id: 'a', lastName: 'Reyes' };
    const ben = { _id: 'b', lastName: 'Cruz' };
    const { lines, moreDoctors } = shapeQueueDisplay(
      [
        entry(1, 'in-progress', { doctor: ana, startedAt: '2026-11-04T01:00:00Z' }),
        entry(2, 'in-progress', { doctor: ana, startedAt: '2026-11-04T02:00:00Z' }),
        ...[3, 4, 5, 6, 7].map((n) => entry(n, 'waiting', { doctor: ana })),
        entry(8, 'waiting', { doctor: ben }),
        entry(9, 'waiting'),
      ],
      { byDoctor: true }
    );
    expect(lines?.map((l) => l.doctor)).toEqual(['Dr. Cruz', 'Dr. Reyes', 'Any doctor']);
    expect(lines?.[1].serving?.number).toBe('W-002');
    expect(lines?.[1].next.map((e) => e.number)).toEqual(['W-003', 'W-004', 'W-005']);
    expect(lines?.[1].waiting).toBe(5);
    expect(lines?.[0].serving).toBeNull();
    expect(moreDoctors).toBe(0);
  });

  it('says how many doctors did not fit', () => {
    const many = Array.from({ length: DOCTOR_LINES_MAX + 2 }, (_, i) => entry(i + 1, 'waiting', { doctor: { _id: `d${i}`, lastName: `Doc${i}` } }));
    const data = shapeQueueDisplay(many, { byDoctor: true });
    expect(data.lines).toHaveLength(DOCTOR_LINES_MAX);
    expect(data.moreDoctors).toBe(2);
  });
});

describe('isClosedNow', () => {
  // A Wednesday: 10:00 and 20:00 in Manila.
  const morning = new Date('2026-11-04T02:00:00Z');
  const evening = new Date('2026-11-04T12:00:00Z');
  const hours = (today: Record<string, unknown>) => [{ day: 'wednesday', ...today }];

  it('goes by the clinic clock, not the server', () => {
    const open = hours({ open: '08:00', close: '17:00' });
    expect(isClosedNow(open, 'Asia/Manila', morning)).toBe(false);
    expect(isClosedNow(open, 'Asia/Manila', evening)).toBe(true);
    // 22:00 in Manila, 09:00 the same day in New York.
    const later = new Date('2026-11-04T14:00:00Z');
    expect(isClosedNow(open, 'Asia/Manila', later)).toBe(true);
    expect(isClosedNow(open, 'America/New_York', later)).toBe(false);
  });

  it('counts closing time as closed and a closed day as closed', () => {
    expect(isClosedNow(hours({ open: '08:00', close: '20:00' }), 'Asia/Manila', evening)).toBe(true);
    expect(isClosedNow(hours({ open: '08:00', close: '17:00', closed: true }), 'Asia/Manila', morning)).toBe(true);
  });

  it('stays open whenever the hours can not say', () => {
    expect(isClosedNow([], 'Asia/Manila', evening)).toBe(false);
    expect(isClosedNow(null, 'Asia/Manila', evening)).toBe(false);
    expect(isClosedNow([{ day: 'monday', open: '08:00', close: '17:00' }], 'Asia/Manila', evening)).toBe(false);
    expect(isClosedNow(hours({ open: '18:00', close: '02:00' }), 'Asia/Manila', morning)).toBe(false);
  });
});

describe('loadQueueDisplay', () => {
  const tenantId = '507f1f77bcf86cd799439022';
  const doctorId = '507f1f77bcf86cd799439033';

  function queueReturns(entries: unknown[]) {
    const chain = { select: () => chain, populate: () => chain, sort: () => chain, limit: () => chain, lean: async () => entries };
    vi.mocked(Queue.find).mockReturnValue(chain as never);
    vi.mocked(Queue.aggregate).mockResolvedValue([] as never);
    vi.mocked(getSettings).mockResolvedValue({
      queueSettings: { displayByDoctor: true, displayTicker: 'Hello' },
      businessHours: [{ day: 'wednesday', open: '08:00', close: '08:01' }],
    } as never);
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
    vi.mocked(Queue.find).mockClear();
    vi.mocked(Queue.aggregate).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('shares one read between screens, then reads again', async () => {
    queueReturns([]);
    const [one, two] = await Promise.all([loadQueueDisplay(tenantId), loadQueueDisplay(tenantId)]);
    expect(two).toBe(one);
    await loadQueueDisplay(tenantId);
    expect(Queue.find).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-11-04T12:00:06Z'));
    await loadQueueDisplay(tenantId);
    expect(Queue.find).toHaveBeenCalledTimes(2);
    expect(Queue.aggregate).toHaveBeenCalledTimes(1);
  });

  it('keeps each doctor screen separate, and a single-doctor screen is never grouped', async () => {
    queueReturns([]);
    vi.setSystemTime(new Date('2026-11-04T12:01:00Z'));
    const whole = await loadQueueDisplay(tenantId);
    const single = await loadQueueDisplay(tenantId, { doctorId });
    expect(Queue.find).toHaveBeenCalledTimes(2);
    expect(whole.lines).toEqual([]);
    expect(single.lines).toBeNull();
    expect(single.ticker).toBe('Hello');
  });

  it('never calls a clinic closed while patients are still in line', async () => {
    vi.setSystemTime(new Date('2026-11-04T12:02:00Z'));
    queueReturns([]);
    expect((await loadQueueDisplay(tenantId)).closed).toBe(true);
    vi.setSystemTime(new Date('2026-11-04T12:03:00Z'));
    queueReturns([entry(1, 'waiting')]);
    expect((await loadQueueDisplay(tenantId)).closed).toBe(false);
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
