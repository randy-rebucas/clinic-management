import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/models/Queue', () => ({ default: {} }));

import { estimateWaits } from '@/lib/queue-wait';

const doctor = (id: string) => ({ _id: id });
const waiting = (d?: { _id: string }) => ({ status: 'waiting', doctor: d });
const seeing = (d?: { _id: string }) => ({ status: 'in-progress', doctor: d });

describe('estimateWaits', () => {
  it('counts each doctor’s line on its own', () => {
    const a1 = waiting(doctor('a'));
    const b1 = waiting(doctor('b'));
    const a2 = waiting(doctor('a'));
    const waits = estimateWaits([a1, b1, a2], new Map(), 15);
    expect(waits.get(a1)).toMatchObject({ position: 1, estimatedWaitTime: 0 });
    expect(waits.get(b1)).toMatchObject({ position: 1, estimatedWaitTime: 0 });
    expect(waits.get(a2)).toMatchObject({ position: 2, estimatedWaitTime: 15 });
  });

  it('adds half a consultation when the doctor is busy, rounded to five minutes', () => {
    const next = waiting(doctor('a'));
    const waits = estimateWaits([seeing(doctor('a')), next], new Map(), 15);
    expect(waits.get(next)?.estimatedWaitTime).toBe(10);
  });

  it('uses the doctor’s average today over the clinic default', () => {
    const first = waiting(doctor('a'));
    const second = waiting(doctor('a'));
    const waits = estimateWaits([first, second], new Map([['a', 30]]), 15);
    expect(waits.get(second)).toMatchObject({ estimatedWaitTime: 30, consultMinutes: 30 });
  });

  it('gives no estimate for someone already being seen, and shares a line for unassigned patients', () => {
    const called = seeing();
    const one = waiting();
    const two = waiting();
    const waits = estimateWaits([called, one, two], new Map(), 10);
    expect(waits.has(called)).toBe(false);
    expect(waits.get(two)?.position).toBe(2);
  });
});
