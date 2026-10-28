import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('server-only', () => ({}));
vi.mock('@/models/Role', () => ({ default: { findOne: vi.fn(), create: vi.fn() } }));
vi.mock('@/models/Permission', () => ({ default: { insertMany: vi.fn() } }));
vi.mock('@/lib/permissions', () => ({
  DEFAULT_ROLE_PERMISSIONS: { 'medical-technologist': [{ resource: 'lab-results', actions: ['read', 'update'] }] },
}));

import Role from '@/models/Role';
import Permission from '@/models/Permission';
import { findOrCreateStandardRole } from '@/lib/standard-roles';

const TENANT = new Types.ObjectId();

describe('findOrCreateStandardRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the clinic's existing role", async () => {
    const existing = { name: 'medical-technologist' };
    vi.mocked(Role.findOne).mockResolvedValue(existing as any);
    expect(await findOrCreateStandardRole(TENANT, 'medical-technologist')).toBe(existing);
    expect(Role.create).not.toHaveBeenCalled();
  });

  it('adds a missing standard role with its standard access', async () => {
    vi.mocked(Role.findOne).mockResolvedValue(null);
    const role = { _id: new Types.ObjectId(), save: vi.fn() } as any;
    vi.mocked(Role.create).mockResolvedValue(role);
    vi.mocked(Permission.insertMany).mockResolvedValue([{ _id: 'p1' }] as any);

    expect(await findOrCreateStandardRole(TENANT, 'medical-technologist')).toBe(role);
    expect(Role.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT, name: 'medical-technologist' }));
    expect(Permission.insertMany).toHaveBeenCalledWith([
      { tenantId: TENANT, role: role._id, resource: 'lab-results', actions: ['read', 'update'] },
    ]);
    expect(role.permissions).toEqual(['p1']);
  });

  it('never invents a role that is not standard', async () => {
    vi.mocked(Role.findOne).mockResolvedValue(null);
    expect(await findOrCreateStandardRole(TENANT, 'employee')).toBeNull();
    expect(Role.create).not.toHaveBeenCalled();
  });

  it('uses the role another request created at the same moment', async () => {
    const raced = { name: 'medical-technologist' };
    vi.mocked(Role.findOne).mockResolvedValueOnce(null).mockResolvedValueOnce(raced as any);
    vi.mocked(Role.create).mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    expect(await findOrCreateStandardRole(TENANT, 'medical-technologist')).toBe(raced);
  });
});
