import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/push-notifications', () => ({ sendPushToUserDevices: vi.fn() }));
vi.mock('@/models/MedicalRepresentative', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/MedicalRepresentativeVisit', () => ({ default: { find: vi.fn(), updateMany: vi.fn() } }));
vi.mock('@/models/Product', () => ({ default: { find: vi.fn(), updateMany: vi.fn() } }));

import MedicalRepresentative from '@/models/MedicalRepresentative';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import Product from '@/models/Product';
import { sendPushToUserDevices } from '@/lib/push-notifications';
import {
  expiryAlertMessage,
  processMedrepReminders,
  visitDayLabel,
  visitReminderMessage,
} from '@/lib/automations/medrep-reminders';

const NOW = new Date('2026-10-18T10:00:00Z');
const REP_A = '507f1f77bcf86cd7994390aa';
const REP_B = '507f1f77bcf86cd7994390bb';

const query = (rows: unknown[]) => ({
  select: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(rows) }) }),
});

describe('medrep reminder messages', () => {
  it('labels visit days relative to now', () => {
    expect(visitDayLabel(new Date('2026-10-18T00:00:00Z'), NOW)).toBe('today');
    expect(visitDayLabel(new Date('2026-10-19T00:00:00Z'), NOW)).toBe('tomorrow');
    expect(visitDayLabel(new Date('2026-10-21T00:00:00Z'), NOW)).toBe('Wed, Oct 21');
  });

  it('names the visit and deep-links to it when there is one', () => {
    const msg = visitReminderMessage(
      [{ _id: 'v1', userId: REP_A, clinicName: 'St. Luke', date: new Date('2026-10-19T00:00:00Z'), time: '09:30' }],
      NOW
    );
    expect(msg.body).toBe('St. Luke, tomorrow at 09:30');
    expect(msg.data).toEqual({ screen: 'visits', id: 'v1' });
  });

  it('summarises several visits, earliest first', () => {
    const msg = visitReminderMessage(
      [
        { _id: 'v2', userId: REP_A, clinicName: 'Later', date: new Date('2026-10-19T00:00:00Z'), time: '14:00' },
        { _id: 'v1', userId: REP_A, clinicName: 'Sooner', date: new Date('2026-10-19T00:00:00Z'), time: '08:00' },
      ],
      NOW
    );
    expect(msg.title).toBe('2 upcoming visits');
    expect(msg.body).toBe('Next: Sooner, tomorrow at 08:00');
    expect(msg.data).toEqual({ screen: 'visits' });
  });

  it('deep-links a single expiring product', () => {
    const msg = expiryAlertMessage([{ _id: 'p1', userId: REP_A, name: 'Amoxil', expiryDate: new Date('2026-11-01T00:00:00Z') }]);
    expect(msg.body).toBe('Amoxil expires on Nov 1, 2026');
    expect(msg.data).toEqual({ screen: 'products', id: 'p1' });
  });
});

describe('processMedrepReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendPushToUserDevices).mockResolvedValue({ sent: true });
  });

  it('sends one push per rep per kind, skips muted reps, and marks every row handled', async () => {
    vi.mocked(MedicalRepresentativeVisit.find).mockReturnValue(query([
      { _id: 'v1', userId: REP_A, clinicName: 'A1', date: new Date('2026-10-19T00:00:00Z'), time: '09:00' },
      { _id: 'v2', userId: REP_A, clinicName: 'A2', date: new Date('2026-10-19T00:00:00Z'), time: '11:00' },
      { _id: 'v3', userId: REP_B, clinicName: 'B1', date: new Date('2026-10-19T00:00:00Z'), time: '10:00' },
    ]) as any);
    vi.mocked(Product.find).mockReturnValue(query([
      { _id: 'p1', userId: REP_A, name: 'Amoxil', expiryDate: new Date('2026-11-01T00:00:00Z') },
    ]) as any);
    vi.mocked(MedicalRepresentative.find).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ userId: REP_B }]) }),
    } as any);

    const result = await processMedrepReminders(NOW);

    expect(result).toMatchObject({ success: true, visitReminders: 1, expiryAlerts: 1, errors: [] });
    const recipients = vi.mocked(sendPushToUserDevices).mock.calls.map((c) => c[0]);
    expect(recipients).toEqual([REP_A, REP_A]); // visits + products for A; B is muted
    // B's visit is still marked, so it isn't retried tomorrow
    const marked = vi.mocked(MedicalRepresentativeVisit.updateMany).mock.calls.flatMap((c: any[]) => c[0]._id.$in);
    expect(marked.sort()).toEqual(['v1', 'v2', 'v3']);
    expect(Product.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['p1'] } },
      { $set: { expiryAlertSentAt: NOW } }
    );
  });

  it('only looks at unreminded scheduled visits from today through the next 24 hours', async () => {
    vi.mocked(MedicalRepresentativeVisit.find).mockReturnValue(query([]) as any);
    vi.mocked(Product.find).mockReturnValue(query([]) as any);
    await processMedrepReminders(NOW);
    const filter = (vi.mocked(MedicalRepresentativeVisit.find).mock.calls[0] as any[])[0];
    expect(filter.status).toBe('scheduled');
    expect(filter.reminderSentAt).toBeNull();
    expect(filter.date.$gte.toISOString()).toBe('2026-10-18T00:00:00.000Z');
    expect(filter.date.$lte.toISOString()).toBe('2026-10-19T10:00:00.000Z');
    expect(sendPushToUserDevices).not.toHaveBeenCalled();
  });
});
