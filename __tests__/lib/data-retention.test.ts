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

// vi.mock is hoisted, so the shared factory must be hoisted too.
const modelMock = vi.hoisted(() => () => ({
  default: {
    find: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('@/models/Appointment', modelMock);
vi.mock('@/models/Visit', modelMock);
vi.mock('@/models/Invoice', modelMock);
vi.mock('@/models/LabResult', modelMock);
vi.mock('@/models/Prescription', modelMock);
vi.mock('@/models/Document', modelMock);
vi.mock('@/models/AuditLog', modelMock);

vi.mock('@/models/Tenant', () => ({
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

/** find(filter).select('_id').limit(n).lean() → ids */
function mockIdQuery(ids: Types.ObjectId[]) {
  return {
    select: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(ids.map((_id) => ({ _id }))),
      }),
    }),
  } as any;
}

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

    it('should only ever delete audit logs', () => {
      const deletable = getDefaultRetentionPolicies().filter((p) => p.deleteAfterDays > 0);
      expect(deletable.map((p) => p.resource)).toEqual(['audit-logs']);
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

    it('should archive old records in tenant-scoped batches', async () => {
      const { getSettings } = await import('@/lib/settings');
      const Appointment = (await import('@/models/Appointment')).default;

      vi.mocked(getSettings).mockResolvedValue({
        automationSettings: {
          autoDataRetention: true,
        },
      } as any);

      const ids = [new Types.ObjectId(), new Types.ObjectId()];
      vi.mocked(Appointment.find).mockReturnValue(mockIdQuery(ids));
      vi.mocked(Appointment.updateMany).mockResolvedValue({ modifiedCount: 2 } as any);

      const result = await applyDataRetentionPolicy(tenantId, [
        {
          resource: 'appointments',
          archiveAfterDays: 365,
          deleteAfterDays: 0,
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.archived.appointments).toBe(2);
      const filter = (vi.mocked(Appointment.find).mock.calls[0] as any[])[0];
      expect(filter.tenantId).toEqual(tenantId);
      expect(Appointment.updateMany).toHaveBeenCalledWith(
        { _id: { $in: ids } },
        { $set: expect.objectContaining({ archived: true }) }
      );
      // Clinical records are never deleted
      expect(Appointment.deleteMany).not.toHaveBeenCalled();
    });

    it('should not delete audit logs younger than the minimum retention', async () => {
      const { getSettings } = await import('@/lib/settings');
      const AuditLog = (await import('@/models/AuditLog')).default;

      vi.mocked(getSettings).mockResolvedValue({ automationSettings: { autoDataRetention: true } } as any);
      vi.mocked(AuditLog.find).mockReturnValue(mockIdQuery([]));

      await applyDataRetentionPolicy(tenantId, [
        { resource: 'audit-logs', archiveAfterDays: 0, deleteAfterDays: 1 },
      ]);

      const filter = (vi.mocked(AuditLog.find).mock.calls[0] as any[])[0];
      const cutoff: Date = filter.createdAt.$lt;
      const ageDays = (Date.now() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
      expect(ageDays).toBeGreaterThanOrEqual(364);
      expect(AuditLog.deleteMany).not.toHaveBeenCalled();
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
          autoDataRetention: false,
        },
      } as any);

      const result = await processDataRetentionForAllTenants();

      expect(result.success).toBe(true);
      expect(result.tenantsProcessed).toBe(2);
    });
  });
});
