import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkSubscriptionLimit } from '@/lib/subscription-limits';
import { Types } from 'mongoose';

// Mock dependencies
vi.mock('@/lib/mongodb', () => ({
  default: vi.fn(),
}));

vi.mock('@/lib/subscription', () => ({
  checkSubscriptionStatus: vi.fn(),
}));

vi.mock('@/models/Patient', () => ({
  default: {
    countDocuments: vi.fn(),
  },
}));

vi.mock('@/models/User', () => ({
  default: {
    countDocuments: vi.fn(),
  },
}));

vi.mock('@/models/Doctor', () => ({
  default: {
    countDocuments: vi.fn(),
  },
}));

vi.mock('@/models/Appointment', () => ({
  default: {
    countDocuments: vi.fn(),
  },
}));

describe('Subscription Limits', () => {
  const tenantId = new Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkSubscriptionLimit', () => {
    it('should allow action when under limit', async () => {
      const { checkSubscriptionStatus } = await import('@/lib/subscription');
      const Patient = (await import('@/models/Patient')).default;

      vi.mocked(checkSubscriptionStatus).mockResolvedValue({
        isActive: true,
        isExpired: false,
        isTrial: false,
        plan: 'basic',
        status: 'active',
      });

      vi.mocked(Patient.countDocuments).mockResolvedValue(50); // Under limit of 100

      const result = await checkSubscriptionLimit(tenantId, 'createPatient');

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(50);
      expect(result.limit).toBe(100);
    });

    it('should deny action when limit exceeded', async () => {
      const { checkSubscriptionStatus } = await import('@/lib/subscription');
      const Patient = (await import('@/models/Patient')).default;

      vi.mocked(checkSubscriptionStatus).mockResolvedValue({
        isActive: true,
        isExpired: false,
        isTrial: false,
        plan: 'basic',
        status: 'active',
      });

      vi.mocked(Patient.countDocuments).mockResolvedValue(101); // Over limit of 100

      const result = await checkSubscriptionLimit(tenantId, 'createPatient');

      expect(result.allowed).toBe(false);
      expect(result.message).toContain('maximum number of patients');
    });

    it('should deny action when subscription expired', async () => {
      const { checkSubscriptionStatus } = await import('@/lib/subscription');

      vi.mocked(checkSubscriptionStatus).mockResolvedValue({
        isActive: false,
        isExpired: true,
        isTrial: false,
        plan: 'trial',
        status: 'expired',
      });

      const result = await checkSubscriptionLimit(tenantId, 'createPatient');

      expect(result.allowed).toBe(false);
      expect(result.message).toContain('expired');
    });
  });
});

