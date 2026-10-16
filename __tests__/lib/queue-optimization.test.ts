import { describe, it, expect, beforeEach, vi } from 'vitest';
import { optimizeQueue, optimizeQueueScheduling } from '@/lib/automations/queue-optimization';
import { Types } from 'mongoose';

// Mock dependencies
vi.mock('@/lib/mongodb', () => ({
  default: vi.fn(),
}));

vi.mock('@/models/Queue', () => ({
  default: {
    find: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('@/models/Appointment', () => ({
  default: {
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('@/models/Doctor', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('@/models/Room', () => ({
  default: {
    find: vi.fn(),
  },
}));

vi.mock('@/lib/settings', () => ({
  getSettings: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('Queue Optimization', () => {
  const tenantId = new Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('optimizeQueue', () => {
    it('should return early if feature is disabled', async () => {
      const { getSettings } = await import('@/lib/settings');
      vi.mocked(getSettings).mockResolvedValue({
        automationSettings: {
          autoQueueOptimization: false,
        },
      } as any);

      const result = await optimizeQueue(tenantId);

      expect(result.optimized).toBe(false);
      expect(result.changes).toHaveLength(0);
    });

    it('moves a waiting patient from a busy doctor to a free doctor with a shorter queue', async () => {
      const { getSettings } = await import('@/lib/settings');
      const Queue = (await import('@/models/Queue')).default;
      const Doctor = (await import('@/models/Doctor')).default;
      const Room = (await import('@/models/Room')).default;

      vi.mocked(getSettings).mockResolvedValue({
        automationSettings: {
          autoQueueOptimization: true,
        },
      } as any);

      const busy = { _id: new Types.ObjectId(), firstName: 'Busy', lastName: 'Doc' };
      const free = { _id: new Types.ObjectId(), firstName: 'Free', lastName: 'Doc' };
      const booked = { _id: new Types.ObjectId(), status: 'waiting', doctor: busy, appointment: { doctor: busy._id }, queuedAt: new Date() };
      const walkIn1 = { _id: new Types.ObjectId(), status: 'waiting', doctor: busy, queuedAt: new Date() };
      const walkIn2 = { _id: new Types.ObjectId(), status: 'waiting', doctor: busy, queuedAt: new Date() };
      const entries = [
        { _id: new Types.ObjectId(), status: 'in-progress', doctor: busy, room: { _id: new Types.ObjectId() }, queuedAt: new Date() },
        booked,
        walkIn1,
        walkIn2,
      ];

      vi.mocked(Queue.find).mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              populate: vi.fn().mockReturnValue({
                sort: vi.fn().mockReturnValue({
                  lean: vi.fn().mockResolvedValue(entries),
                }),
              }),
            }),
          }),
        }),
      } as any);
      vi.mocked(Queue.updateOne).mockResolvedValue({ modifiedCount: 1 } as any);

      vi.mocked(Doctor.find).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([busy, free]),
        }),
      } as any);

      vi.mocked(Room.find).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const result = await optimizeQueue(tenantId);

      // Busy doctor has 3 waiting; moving one walk-in to the free doctor balances to 2/1,
      // and the patient who booked the busy doctor is never moved.
      expect(result.optimized).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].queueId).toBe(walkIn1._id.toString());
      expect(Queue.updateOne).toHaveBeenCalledTimes(1);
      const [filter, update] = vi.mocked(Queue.updateOne).mock.calls[0] as any[];
      expect(filter).toMatchObject({ _id: walkIn1._id, tenantId, status: 'waiting' });
      expect(update).toEqual({ $set: { doctor: free._id } });
      expect(result.metrics.totalPatients).toBe(4);
    });

    it('never reassigns when no other doctor is free', async () => {
      const { getSettings } = await import('@/lib/settings');
      const Queue = (await import('@/models/Queue')).default;
      const Doctor = (await import('@/models/Doctor')).default;
      const Room = (await import('@/models/Room')).default;

      vi.mocked(getSettings).mockResolvedValue({ automationSettings: { autoQueueOptimization: true } } as any);

      const only = { _id: new Types.ObjectId(), firstName: 'Only', lastName: 'Doc' };
      vi.mocked(Queue.find).mockReturnValue({
        populate: () => ({ populate: () => ({ populate: () => ({ populate: () => ({ sort: () => ({ lean: async () => [
          { _id: new Types.ObjectId(), status: 'in-progress', doctor: only, room: {} },
          { _id: new Types.ObjectId(), status: 'waiting', doctor: only },
          { _id: new Types.ObjectId(), status: 'waiting', doctor: only },
        ] }) }) }) }) }),
      } as any);
      vi.mocked(Doctor.find).mockReturnValue({ select: () => ({ lean: async () => [only] }) } as any);
      vi.mocked(Room.find).mockReturnValue({ select: () => ({ lean: async () => [] }) } as any);

      const result = await optimizeQueue(tenantId);

      expect(result.changes).toHaveLength(0);
      expect(Queue.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('optimizeQueueScheduling', () => {
    it('should provide scheduling recommendations', async () => {
      const Appointment = (await import('@/models/Appointment')).default;
      vi.mocked(Appointment.find).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { appointmentDate: new Date('2024-01-15T00:00:00Z'), appointmentTime: '10:00', doctor: new Types.ObjectId() },
            { appointmentDate: new Date('2024-01-15T00:00:00Z'), appointmentTime: '10:30', doctor: new Types.ObjectId() },
          ]),
        }),
      } as any);

      const result = await optimizeQueueScheduling(tenantId);

      expect(result.success).toBe(true);
      // Peak hour is read from the clinic-local appointmentTime (10:00), not a UTC Date.
      expect(result.recommendations).toEqual([
        expect.objectContaining({ type: 'time-slot', recommendation: expect.stringContaining('10:00') }),
      ]);
    });

    it('handles a tenant with no appointments', async () => {
      const Appointment = (await import('@/models/Appointment')).default;
      vi.mocked(Appointment.find).mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
      } as any);

      const result = await optimizeQueueScheduling(tenantId);

      expect(result.success).toBe(true);
      expect(result.recommendations).toEqual([]);
    });
  });
});