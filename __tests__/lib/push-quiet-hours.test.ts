import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));
vi.mock('expo-server-sdk', () => ({
  Expo: class {
    static isExpoPushToken = () => true;
    chunkPushNotifications = (m: unknown[]) => [m];
    sendPushNotificationsAsync = vi.fn().mockResolvedValue([{ status: 'ok' }]);
  },
}));
vi.mock('@/models/PushSubscription', () => ({ default: { find: vi.fn(), deleteMany: vi.fn() } }));
vi.mock('@/models/MobileDevice', () => ({ default: { find: vi.fn(), updateMany: vi.fn() } }));
vi.mock('@/models/NotificationPreference', () => ({ default: { find: vi.fn() } }));

import webpush from 'web-push';
import PushSubscription from '@/models/PushSubscription';
import MobileDevice from '@/models/MobileDevice';
import NotificationPreference from '@/models/NotificationPreference';
import { sendPushToTenant, sendPushToUser, sendPushToUserDevices } from '@/lib/push-notifications';

const TENANT = '64b000000000000000000010';
const QUIET = '64b000000000000000000001';
const AWAKE = '64b000000000000000000002';

const paused = (userId: string) => ({ userId, pausedUntil: new Date(Date.now() + 3_600_000) });
const subscription = (userId: string) => ({ userId, endpoint: `https://push.test/${userId}`, keys: { p256dh: 'p', auth: 'a' } });

const preferences = (rows: unknown[]) =>
  vi.mocked(NotificationPreference.find).mockReturnValue({ select: () => ({ lean: () => Promise.resolve(rows) }) } as any);
const subscriptions = (rows: unknown[]) =>
  vi.mocked(PushSubscription.find).mockReturnValue({ lean: () => Promise.resolve(rows) } as any);

const sentTo = () => vi.mocked(webpush.sendNotification).mock.calls.map(([sub]) => sub.endpoint);

beforeAll(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'public';
  process.env.VAPID_PRIVATE_KEY = 'private';
});

beforeEach(() => {
  vi.mocked(webpush.sendNotification).mockReset().mockResolvedValue({} as any);
  vi.mocked(NotificationPreference.find).mockReset();
  vi.mocked(MobileDevice.find).mockReset().mockReturnValue({ lean: () => Promise.resolve([{ pushToken: 'ExponentPushToken[x]' }]) } as any);
  preferences([]);
  subscriptions([subscription(QUIET)]);
});

describe('sendPushToUser', () => {
  it('holds a normal push for someone who paused', async () => {
    preferences([paused(QUIET)]);
    await sendPushToUser(QUIET, { title: 't', body: 'b' });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('delivers to someone with no preferences', async () => {
    await sendPushToUser(QUIET, { title: 't', body: 'b' });
    expect(sentTo()).toEqual([`https://push.test/${QUIET}`]);
  });

  it('delivers urgent without reading preferences', async () => {
    preferences([paused(QUIET)]);
    await sendPushToUser(QUIET, { title: 't', body: 'b', priority: 'urgent' });
    expect(NotificationPreference.find).not.toHaveBeenCalled();
    expect(sentTo()).toHaveLength(1);
  });

  it('delivers when preferences cannot be read', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(NotificationPreference.find).mockImplementation(() => {
      throw new Error('database down');
    });
    await sendPushToUser(QUIET, { title: 't', body: 'b' });
    expect(sentTo()).toHaveLength(1);
    log.mockRestore();
  });

  it('sends the priority so the browser can keep an urgent alert on screen', async () => {
    await sendPushToUser(QUIET, { title: 't', body: 'b', priority: 'urgent' });
    expect(JSON.parse(vi.mocked(webpush.sendNotification).mock.calls[0][1] as string).priority).toBe('urgent');
  });
});

describe('sendPushToTenant', () => {
  it('leaves out only the people holding pushes', async () => {
    subscriptions([subscription(QUIET), subscription(AWAKE)]);
    preferences([paused(QUIET)]);
    await sendPushToTenant(TENANT, { title: 't', body: 'b' });
    expect(sentTo()).toEqual([`https://push.test/${AWAKE}`]);
  });
});

describe('sendPushToUserDevices', () => {
  it('holds a feed push that asks to honor quiet hours', async () => {
    preferences([paused(QUIET)]);
    expect(await sendPushToUserDevices(QUIET, { title: 't', body: 'b' }, { honorQuietHours: true })).toEqual({ sent: false });
    expect(MobileDevice.find).not.toHaveBeenCalled();
  });

  it('never holds a one-shot reminder, which has no copy in the feed', async () => {
    preferences([paused(QUIET)]);
    await sendPushToUserDevices(QUIET, { title: 't', body: 'b', tag: 'medrep-visit' });
    expect(NotificationPreference.find).not.toHaveBeenCalled();
    expect(MobileDevice.find).toHaveBeenCalled();
  });
});
