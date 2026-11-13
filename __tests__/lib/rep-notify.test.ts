import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/models/Notification', () => ({ default: { create: vi.fn() } }));
vi.mock('@/models/MedicalRepresentative', () => ({ default: { exists: vi.fn(), findById: vi.fn() } }));
vi.mock('@/models/Tenant', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/lib/notify', () => ({ notifyStaff: vi.fn() }));
vi.mock('@/lib/push-notifications', () => ({ sendPushToUserDevices: vi.fn() }));

import Notification from '@/models/Notification';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import Tenant from '@/models/Tenant';
import { sendPushToUserDevices } from '@/lib/push-notifications';
import { notifyRep, notificationTypeForKind } from '@/lib/rep-notify';
import { notifyRepOfVisit } from '@/lib/rep-visits';
import { notifyRepOfDelivery } from '@/lib/rep-deliveries';
import { notifyRepAddedByClinic } from '@/lib/rep-access';

const USER = '507f1f77bcf86cd799439044';
const NOTIFICATION = '507f1f77bcf86cd7994390ee';
const VISIT = '507f1f77bcf86cd7994390a1';
const CLINIC = '507f1f77bcf86cd799439011';
const DAY = 24 * 3600 * 1000;

const lean = (value: unknown) => ({ select: () => ({ lean: async () => value }) });
const stored = () => vi.mocked(Notification.create).mock.calls[0][0] as any;
const pushed = () => vi.mocked(sendPushToUserDevices).mock.calls[0];

describe('notifyRep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Notification.create).mockResolvedValue({ _id: NOTIFICATION } as any);
    vi.mocked(MedicalRepresentative.exists).mockResolvedValue(null);
    vi.mocked(sendPushToUserDevices).mockResolvedValue({ sent: true });
  });

  it('stores an inbox record with routing metadata and a 90-day expiry, then pushes it with the notification id', async () => {
    const result = await notifyRep(
      { userId: USER, notificationsEnabled: true },
      { kind: 'sponsorship', title: 'Sponsorship paid', body: 'Thanks.', screen: 'sponsorships', id: 's1', tag: 'sponsorship-s1' }
    );

    expect(result).toEqual({ notificationId: NOTIFICATION, sent: true });
    const doc = stored();
    expect(String(doc.user)).toBe(USER);
    expect(doc).not.toHaveProperty('tenantId');
    expect(doc).toMatchObject({
      type: 'system',
      title: 'Sponsorship paid',
      message: 'Thanks.',
      read: false,
      sender: { kind: 'system' },
      metadata: { kind: 'sponsorship', screen: 'sponsorships', id: 's1' },
    });
    expect(doc.expiresAt.getTime() - Date.now()).toBeGreaterThan(89 * DAY);
    expect(doc.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(90 * DAY);
    expect(pushed()).toEqual([
      USER,
      { title: 'Sponsorship paid', body: 'Thanks.', tag: 'sponsorship-s1', data: { screen: 'sponsorships', id: 's1', notificationId: NOTIFICATION } },
    ]);
    // The caller knew the push switch: no lookup.
    expect(MedicalRepresentative.exists).not.toHaveBeenCalled();
  });

  it('still stores the record when the rep switched push off, and does not push', async () => {
    const result = await notifyRep({ userId: USER, notificationsEnabled: false }, { kind: 'team', title: 'Team invite', body: 'Join us', screen: 'team' });
    expect(Notification.create).toHaveBeenCalledTimes(1);
    expect(sendPushToUserDevices).not.toHaveBeenCalled();
    expect(result).toEqual({ notificationId: NOTIFICATION, sent: false });
  });

  it('looks the push switch up when the caller does not have it', async () => {
    vi.mocked(MedicalRepresentative.exists).mockResolvedValue({ _id: 'x' } as any);
    await notifyRep({ userId: USER }, { kind: 'visit', title: 't', body: 'b', screen: 'visits' });
    expect(String((vi.mocked(MedicalRepresentative.exists).mock.calls[0][0] as any).userId)).toBe(USER);
    expect(Notification.create).toHaveBeenCalledTimes(1);
    expect(sendPushToUserDevices).not.toHaveBeenCalled();
  });

  it('never throws: a failed write still pushes (without an id), a failed push still returns', async () => {
    vi.mocked(Notification.create).mockRejectedValue(new Error('db down'));
    vi.mocked(sendPushToUserDevices).mockRejectedValue(new Error('expo down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(notifyRep({ userId: USER, notificationsEnabled: true }, { kind: 'clinic', title: 't', body: 'b', screen: 'clinics' })).resolves.toEqual({
      notificationId: null,
      sent: false,
    });
    expect(pushed()[1].data).toEqual({ screen: 'clinics' });
    vi.mocked(MedicalRepresentative.exists).mockRejectedValue(new Error('lookup failed'));
    await expect(notifyRep({ userId: USER }, { kind: 'clinic', title: 't', body: 'b', screen: 'clinics' })).resolves.toMatchObject({ sent: false });
    await expect(notifyRep({ userId: 'not-an-id' }, { kind: 'clinic', title: 't', body: 'b', screen: 'clinics' })).resolves.toEqual({
      notificationId: null,
      sent: false,
    });
    spy.mockRestore();
  });

  it('passes quiet hours and priority through only when asked', async () => {
    await notifyRep({ userId: USER, notificationsEnabled: true }, { kind: 'support', title: 't', body: 'b', screen: 'support', priority: 'high' }, { honorQuietHours: true });
    expect(pushed()[1]).toMatchObject({ priority: 'high' });
    expect(pushed()[2]).toEqual({ honorQuietHours: true });
    expect(stored()).toMatchObject({ type: 'support', priority: 'high' });
  });

  it('maps kinds onto the stored notification type', () => {
    expect(notificationTypeForKind('visit')).toBe('visit');
    expect(notificationTypeForKind('reminder')).toBe('reminder');
    expect(notificationTypeForKind('expiry')).toBe('reminder');
    expect(notificationTypeForKind('support')).toBe('support');
    for (const k of ['delivery', 'clinic', 'team', 'sponsorship'] as const) expect(notificationTypeForKind(k)).toBe('system');
  });
});

describe('rep senders store and push through notifyRep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Notification.create).mockResolvedValue({ _id: NOTIFICATION } as any);
    vi.mocked(MedicalRepresentative.exists).mockResolvedValue(null);
    vi.mocked(sendPushToUserDevices).mockResolvedValue({ sent: true });
  });

  const visit = { _id: VISIT, userId: USER, clinicId: CLINIC, clinicName: 'Sunrise', date: new Date('2026-11-20T00:00:00Z'), time: '09:00' };

  it('visit answers: kind visit, opens the visit, same copy and tag', async () => {
    await notifyRepOfVisit(visit, 'approved', 'Bring samples.');
    expect(stored()).toMatchObject({ type: 'visit', title: 'Visit approved', metadata: { kind: 'visit', screen: 'visits', id: VISIT } });
    expect(pushed()[1]).toEqual({
      title: 'Visit approved',
      body: 'Sunrise approved your visit on Fri, Nov 20 at 09:00. Bring samples.',
      tag: `medrep-visit-${VISIT}`,
      data: { screen: 'visits', id: VISIT, notificationId: NOTIFICATION },
    });
  });

  it('a muted rep still gets the visit in the inbox', async () => {
    vi.mocked(MedicalRepresentative.exists).mockResolvedValue({ _id: 'x' } as any);
    await notifyRepOfVisit(visit, 'declined');
    expect(Notification.create).toHaveBeenCalledTimes(1);
    expect(sendPushToUserDevices).not.toHaveBeenCalled();
  });

  it('delivery answers: kind delivery, opens the visit it belongs to', async () => {
    await notifyRepOfDelivery(
      { _id: 'd1', userId: USER, clinicName: 'Sunrise', visitId: VISIT, kind: 'delivery', lines: [{ productName: 'Amoxil', quantity: 2, unit: 'box' }] } as any,
      'received'
    );
    expect(stored()).toMatchObject({ type: 'system', title: 'Delivery confirmed', metadata: { kind: 'delivery', screen: 'visits', id: VISIT } });
    expect(pushed()[1]).toMatchObject({ tag: 'medrep-delivery-d1', data: { screen: 'visits', id: VISIT, notificationId: NOTIFICATION } });
  });

  it('clinic access: kind clinic, opens Clinics; muted reps keep the record', async () => {
    vi.mocked(MedicalRepresentative.findById).mockReturnValue(lean({ userId: USER, notificationsEnabled: false }) as any);
    vi.mocked(Tenant.findById).mockReturnValue(lean({ name: 'Sunrise Clinic' }) as any);
    await notifyRepAddedByClinic('rep1', CLINIC);
    expect(stored()).toMatchObject({ title: 'New clinic', metadata: { kind: 'clinic', screen: 'clinics', id: CLINIC } });
    expect(sendPushToUserDevices).not.toHaveBeenCalled();
  });
});
