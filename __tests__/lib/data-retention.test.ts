import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  applyDataRetentionPolicy,
  getDefaultRetentionPolicies,
  processDataRetentionForAllTenants,
} from '@/lib/automations/data-retention';
import { Types } from 'mongoose';

// Mock dependencies
vi.mock('@/lib/mongodb', () => ({
  default: vi.fn(),
}));

vi.mock('@/models/Appointment', () => ({
  default: {
    find: vi.fn(),
    updateMany: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('@/models/Visit', () => ({
  default: {
    find: vi.fn(),
    updateMany: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('@/models/Invoice', () => ({
  default: {
    find: vi.fn(),
    updateMany: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('@/models/LabResult', () => ({
  default: {
    find: vi.fn(),
    updateMany: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('@/models/Prescription', () => ({
  default: {
    find: vi.fn(),
    updateMany: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('@/models/Document', () => ({
  default: {
    find: vi.fn(),
    updateMany: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('@/models/AuditLog', () => ({
  default: {
    find: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    countDocuments: vi.fn(),
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

describe('Data Retention', () => {
  const tenantId = new Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDefaultRetentionPolicies', () => {
    it('should return default retention policies', () => {
      const policies = getDefaultRetentionPolicies();

      expect(policies).toBeInstanceOf(Array);
      expect(policies.length).toBeGreaterThan(0);
      expect(policies[0]).toHaveProperty('resource');
      expect(policies[0]).toHaveProperty('archiveAfterDays');
      expect(policies[0]).toHaveProperty('deleteAfterDays');
    });

    it('should have patients never archived or deleted', () => {
      const policies = getDefaultRetentionPolicies();
      const patientPolicy = policies.find((p) => p.resource === 'patients');

      expect(patientPolicy).toBeDefined();
      expect(patientPolicy?.archiveAfterDays).toBe(0);
      expect(patientPolicy?.deleteAfterDays).toBe(0);
    });
  });

  describe('applyDataRetentionPolicy', () => {
    it('should return early if feature is disabled', async () => {
      const { getSettings } = await import('@/lib/settings');
      vi.mocked(getSettings).mockResolvedValue({
        automationSettings: {
          autoDataRetention: false,
        },
      } as any);

      const result = await applyDataRetentionPolicy(tenantId);

      expect(result.success).toBe(true);
      expect(result.archived).toEqual({});
      expect(result.deleted).toEqual({});
    });

    it('should archive old records', async () => {
      const { getSettings } = await import('@/lib/settings');
      const Appointment = (await import('@/models/Appointment')).default;

      vi.mocked(getSettings).mockResolvedValue({
        automationSettings: {
          autoDataRetention: true,
        },
      } as any);

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 400); // 400 days ago

      vi.mocked(Appointment.find).mockReturnValue({
        length: 5,
        map: vi.fn().mockReturnValue([
          { _id: new Types.ObjectId() },
          { _id: new Types.ObjectId() },
        ]),
      } as any);

      vi.mocked(Appointment.updateMany).mockResolvedValue({} as any);

      const result = await applyDataRetentionPolicy(tenantId, [
        {
          resource: 'appointments',
          archiveAfterDays: 365,
          deleteAfterDays: 0,
        },
      ]);

      expect(result.success).toBe(true);
      expect(Appointment.updateMany).toHaveBeenCalled();
    });
  });

  describe('processDataRetentionForAllTenants', () => {
    it('should process all tenants', async () => {
      const Tenant = (await import('@/models/Tenant')).default;
      vi.mocked(Tenant.find).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([
            { _id: new Types.ObjectId() },
            { _id: new Types.ObjectId() },
          ]),
        }),
      } as any);

      const { getSettings } = await import('@/lib/settings');
      vi.mocked(getSettings).mockResolvedValue({
        automationSettings: {
          autoDataRetention: true,
        },
      } as any);

      const result = await processDataRetentionForAllTenants();

      expect(result.success).toBe(true);
      expect(result.tenantsProcessed).toBeGreaterThanOrEqual(0);
    });
  });
});

