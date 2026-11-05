import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Queue', () => ({ default: { findOne: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/Patient', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/lib/sms', () => ({ sendSMS: vi.fn(async () => undefined) }));
vi.mock('@/lib/push-notifications', () => ({ sendPushToPatientDevices: vi.fn(async () => undefined) }));
vi.mock('@/lib/settings', () => ({ getSettings: vi.fn(async () => ({ clinicName: 'Test Clinic' })) }));
vi.mock('@/lib/queue-position', () => ({ ordinal: vi.fn(), queuePosition: vi.fn(async () => 2) }));
vi.mock('@/lib/queue-wait', () => ({ refreshQueueWaits: vi.fn(async () => undefined) }));

import Queue from '@/models/Queue';
import Patient from '@/models/Patient';
import { sendSMS } from '@/lib/sms';
import { sendPushToPatientDevices } from '@/lib/push-notifications';
import { refreshQueueWaits } from '@/lib/queue-wait';
import { notifyQueuePatient, notifyQueuePositions } from '@/lib/automations/queue-notifications';

const tenantId = new Types.ObjectId();
const queueId = new Types.ObjectId();

function held(entry: Record<string, unknown>, phone: string | null = '+639170000000') {
  vi.mocked(Queue.findOne).mockReturnValue({ lean: async () => ({ _id: queueId, patient: new Types.ObjectId(), ...entry }) } as never);
  vi.mocked(Patient.findOne).mockReturnValue({ select: () => ({ lean: async () => ({ firstName: 'Ana', phone }) }) } as never);
  const line: any = { select: () => line, sort: () => line, limit: () => line, lean: async () => [] };
  vi.mocked(Queue.find).mockReturnValue(line);
}

describe('saving new wait estimates', () => {
  beforeEach(() => {
    vi.mocked(sendSMS).mockClear();
    vi.mocked(refreshQueueWaits).mockClear();
    vi.mocked(Queue.findOne).mockClear();
  });

  it('refreshes once per change, before reading the figure it quotes', async () => {
    held({ status: 'waiting', estimatedWaitTime: 25 });

    await notifyQueuePatient({ queueId, tenantId, newStatus: 'waiting' });

    expect(refreshQueueWaits).toHaveBeenCalledTimes(1);
    expect(vi.mocked(refreshQueueWaits).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(Queue.findOne).mock.invocationCallOrder[0]);
    expect(vi.mocked(sendSMS).mock.calls[0][0].message).toContain('~25 min');
  });

  it.each(['completed', 'cancelled', 'no-show'])('reads no patient for %s, which sends no message', async (newStatus) => {
    held({ status: newStatus });
    vi.mocked(Patient.findOne).mockClear();

    await notifyQueuePatient({ queueId, tenantId, newStatus });

    expect(refreshQueueWaits).toHaveBeenCalledTimes(1);
    expect(Queue.findOne).not.toHaveBeenCalled();
    expect(Patient.findOne).not.toHaveBeenCalled();
  });

  it('refreshes for changes that only move the line', async () => {
    held({ status: 'waiting' });

    await notifyQueuePositions(tenantId);

    expect(refreshQueueWaits).toHaveBeenCalledTimes(1);
  });
});

describe('notifyQueuePatient while away', () => {
  beforeEach(() => {
    vi.mocked(sendSMS).mockClear();
    vi.mocked(sendPushToPatientDevices).mockClear();
  });

  it('tells a patient who missed their call to see the front desk, once by each route', async () => {
    held({ status: 'away', awayReason: 'missed' });

    await notifyQueuePatient({ queueId, tenantId, newStatus: 'away' });

    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendSMS).mock.calls[0][0].message).toContain('see the front desk');
    expect(sendPushToPatientDevices).toHaveBeenCalledTimes(1);
  });

  it('still pushes to a patient with no phone number', async () => {
    held({ status: 'away', awayReason: 'missed' }, null);

    await notifyQueuePatient({ queueId, tenantId, newStatus: 'away' });

    expect(sendSMS).not.toHaveBeenCalled();
    expect(sendPushToPatientDevices).toHaveBeenCalledTimes(1);
  });

  it('says nothing to a patient sent to the lab', async () => {
    held({ status: 'away', awayReason: 'lab' });

    await notifyQueuePatient({ queueId, tenantId, newStatus: 'away' });

    expect(sendSMS).not.toHaveBeenCalled();
    expect(sendPushToPatientDevices).not.toHaveBeenCalled();
  });

  it('still calls a patient in by both routes', async () => {
    held({ status: 'in-progress' });

    await notifyQueuePatient({ queueId, tenantId, newStatus: 'in-progress' });

    expect(vi.mocked(sendSMS).mock.calls[0][0].message).toContain("it's your turn");
    expect(sendPushToPatientDevices).toHaveBeenCalledTimes(1);
  });
});
