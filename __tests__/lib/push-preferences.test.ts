import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));
vi.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken = () => true;
    chunkPushNotifications = (m: unknown[]) => [m];
    sendPushNotificationsAsync = vi.fn().mockResolvedValue([{ status: 'ok' }]);
  },
}));
vi.mock('@/models/PushSubscription', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/MobileDevice', () => ({
  default: { find: vi.fn(), updateMany: vi.fn() },
}));
vi.mock('@/lib/patient-family', () => ({
  personRecordIds: vi.fn().mockResolvedValue([]),
  guardianRecordIds: vi.fn().mockResolvedValue([]),
}));

import MobileDevice from '@/models/MobileDevice';
import { pushCategoryForTag, sendPushToPatientDevices } from '@/lib/push-notifications';

const PATIENT = '64b000000000000000000001';

describe('pushCategoryForTag', () => {
  it('maps each patient push tag to its category', () => {
    expect(pushCategoryForTag('appointment-confirm-123')).toBe('appointments');
    expect(pushCategoryForTag('lab-result-123')).toBe('labResults');
    expect(pushCategoryForTag('queue-123')).toBe('queue');
    expect(pushCategoryForTag('message-123')).toBe('messages');
  });

  it('has no category for untagged or unknown pushes', () => {
    expect(pushCategoryForTag(undefined)).toBeNull();
    expect(pushCategoryForTag('broadcast-1')).toBeNull();
  });
});

describe('sendPushToPatientDevices preferences', () => {
  beforeEach(() => {
    vi.mocked(MobileDevice.find).mockReset();
    vi.mocked(MobileDevice.find).mockReturnValue({ lean: () => Promise.resolve([]) } as any);
  });

  it('skips devices that muted the push category', async () => {
    await sendPushToPatientDevices(PATIENT, { title: 'Result', body: 'Ready', tag: 'lab-result-1' });
    const filter = (vi.mocked(MobileDevice.find).mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(filter['pushPrefs.labResults']).toEqual({ $ne: false });
  });

  it('does not filter on preferences for uncategorized pushes', async () => {
    await sendPushToPatientDevices(PATIENT, { title: 'Hello', body: 'Hi' });
    const filter = (vi.mocked(MobileDevice.find).mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(Object.keys(filter).some((k) => k.startsWith('pushPrefs.'))).toBe(false);
  });
});
