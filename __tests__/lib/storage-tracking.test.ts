import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculateStorageUsage, checkStorageLimit, formatBytes } from '@/lib/storage-tracking';
import { Types } from 'mongoose';

vi.mock('@/lib/mongodb', () => ({
  default: vi.fn(),
}));

vi.mock('@/models/Document', () => ({ default: { aggregate: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/Patient', () => ({ default: { aggregate: vi.fn() } }));
vi.mock('@/models/Visit', () => ({ default: { aggregate: vi.fn() } }));
vi.mock('@/models/LabResult', () => ({ default: { aggregate: vi.fn() } }));

vi.mock('@/lib/subscription', () => ({
  checkSubscriptionStatus: vi.fn(),
}));

import Document from '@/models/Document';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import LabResult from '@/models/LabResult';
import { checkSubscriptionStatus } from '@/lib/subscription';

describe('Storage Tracking', () => {
  const tenantId = new Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    // 1 MB on Cloudinary + 500 KB base64 documents
    vi.mocked(Document.aggregate).mockResolvedValue([{ total: 1500000, cloudinary: 1000000 }] as any);
    vi.mocked(Patient.aggregate).mockResolvedValue([] as any);
    vi.mocked(Visit.aggregate).mockResolvedValue([{ total: 2000, base64: 2000 }] as any);
    vi.mocked(LabResult.aggregate).mockResolvedValue([] as any);
    vi.mocked(checkSubscriptionStatus).mockResolvedValue({
      isActive: true,
      isExpired: false,
      isTrial: false,
      plan: 'basic',
      status: 'active',
      expiresAt: null,
      daysRemaining: null,
    } as any);
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
    });
  });

  describe('calculateStorageUsage', () => {
    it('sums documents and attachments, scoped to the tenant', async () => {
      const usage = await calculateStorageUsage(tenantId);

      expect(usage.documentsBytes).toBe(1500000);
      expect(usage.attachmentsBytes).toBe(2000);
      expect(usage.totalBytes).toBe(1502000);
      expect(usage.cloudinaryBytes).toBe(1000000);
      expect(usage.base64Bytes).toBe(502000);
      expect(usage.limitGB).toBe(5); // Basic plan

      const docMatch = vi.mocked(Document.aggregate).mock.calls[0][0][0] as any;
      expect(docMatch.$match.tenantId).toEqual(tenantId);
      const patientMatch = vi.mocked(Patient.aggregate).mock.calls[0][0][0] as any;
      expect(patientMatch.$match).toEqual({ tenantIds: tenantId });
    });
  });

  describe('checkStorageLimit', () => {
    it('should allow upload when under limit', async () => {
      const result = await checkStorageLimit(tenantId, 1000000);
      expect(result.allowed).toBe(true);
      expect(result.wouldExceed).toBe(false);
      expect(result).toHaveProperty('currentUsage');
    });

    it('should reject upload that would exceed the limit', async () => {
      const result = await checkStorageLimit(tenantId, 6 * 1024 * 1024 * 1024);
      expect(result.allowed).toBe(false);
      expect(result.wouldExceed).toBe(true);
    });
  });
});
