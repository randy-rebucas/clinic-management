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

    it('should optimize queue when enabled', async () => {
      const { getSettings } = await import('@/lib/settings');
      const Queue = (await import('@/models/Queue')).default;
      const Doctor = (await import('@/models/Doctor')).default;
      const Room = (await import('@/models/Room')).default;

      vi.mocked(getSettings).mockResolvedValue({
        automationSettings: {
          autoQueueOptimization: true,
        },
      } as any);

      vi.mocked(Queue.find).mockReturnValue({
        populate: vi.fn().mockReturnValue({
          populate: vi.fn().mockReturnValue({
            populate: vi.fn().mockReturnValue({
              populate: vi.fn().mockReturnValue({
                sort: vi.fn().mockReturnValue({
                  lean: vi.fn().mockResolvedValue([
                    {
                      _id: new Types.ObjectId(),
                      queueNumber: 2,
                      status: 'waiting',
                      patient: { priority: 'urgent' },
                      createdAt: new Date(),
                    },
                  ]),
                }),
              }),
            }),
          }),
        }),
      } as any);

      vi.mocked(Doctor.find).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { _id: new Types.ObjectId(), name: 'Dr. Test', status: 'active' },
          ]),
        }),
      } as any);

      vi.mocked(Room.find).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { _id: new Types.ObjectId(), name: 'Room 1', status: 'available' },
          ]),
        }),
      } as any);

      const result = await optimizeQueue(tenantId);

      expect(result).toHaveProperty('optimized');
      expect(result).toHaveProperty('changes');
      expect(result).toHaveProperty('metrics');
    });
  });

  describe('optimizeQueueScheduling', () => {
    it('should provide scheduling recommendations', async () => {
      const Appointment = (await import('@/models/Appointment')).default;
      vi.mocked(Appointment.find).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { date: new Date('2024-01-15T10:00:00Z'), doctor: new Types.ObjectId() },
            { date: new Date('2024-01-15T10:30:00Z'), doctor: new Types.ObjectId() },
          ]),
        }),
      } as any);

      const result = await optimizeQueueScheduling(tenantId);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('recommendations');
    });
  });
});

