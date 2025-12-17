import { describe, it, expect, beforeEach, vi } from 'vitest';
import { verifyInsurance, batchVerifyInsurance } from '@/lib/automations/insurance-verification';
import { Types } from 'mongoose';

// Mock dependencies
vi.mock('@/lib/mongodb', () => ({
  default: vi.fn(),
}));

vi.mock('@/models/Patient', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('Insurance Verification', () => {
  const tenantId = new Types.ObjectId();
  const patientId = new Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verifyInsurance', () => {
    it('should return error if patient not found', async () => {
      const Patient = (await import('@/models/Patient')).default;
      vi.mocked(Patient.findOne).mockResolvedValue(null);

      const result = await verifyInsurance(patientId, tenantId);

      expect(result.verified).toBe(false);
      expect(result.errors).toContain('Patient not found');
    });

    it('should return error if patient has no insurance', async () => {
      const Patient = (await import('@/models/Patient')).default;
      vi.mocked(Patient.findOne).mockResolvedValue({
        _id: patientId,
        insurance: null,
        save: vi.fn(),
      } as any);

      const result = await verifyInsurance(patientId, tenantId);

      expect(result.verified).toBe(false);
      expect(result.errors).toContain('Patient does not have insurance information');
    });

    it('should verify insurance successfully', async () => {
      const Patient = (await import('@/models/Patient')).default;
      const mockPatient = {
        _id: patientId,
        insurance: {
          provider: 'Test Insurance',
          policyNumber: '1234567890',
        },
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(Patient.findOne).mockResolvedValue(mockPatient as any);

      const result = await verifyInsurance(patientId, tenantId);

      expect(result.verified).toBe(true);
      expect(result.insuranceProvider).toBe('Test Insurance');
      expect(result.policyNumber).toBe('1234567890');
      expect(mockPatient.save).toHaveBeenCalled();
    });

    it('should fail verification for invalid policy number', async () => {
      const Patient = (await import('@/models/Patient')).default;
      vi.mocked(Patient.findOne).mockResolvedValue({
        _id: patientId,
        insurance: {
          provider: 'Test Insurance',
          policyNumber: '123', // Too short
        },
        save: vi.fn(),
      } as any);

      const result = await verifyInsurance(patientId, tenantId);

      expect(result.verified).toBe(false);
      expect(result.errors).toContain('Invalid policy number format');
    });
  });

  describe('batchVerifyInsurance', () => {
    it('should verify multiple patients', async () => {
      const Patient = (await import('@/models/Patient')).default;
      const mockPatient = {
        _id: patientId,
        insurance: {
          provider: 'Test Insurance',
          policyNumber: '1234567890',
        },
        save: vi.fn().mockResolvedValue(true),
      };
      vi.mocked(Patient.findOne).mockResolvedValue(mockPatient as any);

      const result = await batchVerifyInsurance([patientId, patientId], tenantId);

      expect(result.success).toBe(true);
      expect(result.verified).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(2);
    });

    it('should handle errors gracefully', async () => {
      const Patient = (await import('@/models/Patient')).default;
      vi.mocked(Patient.findOne).mockRejectedValue(new Error('Database error'));

      const result = await batchVerifyInsurance([patientId], tenantId);

      expect(result.success).toBe(true);
      expect(result.verified).toBe(0);
      expect(result.failed).toBe(1);
    });
  });
});

