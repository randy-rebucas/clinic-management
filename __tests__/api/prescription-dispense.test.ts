import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/app/lib/dal', () => ({ verifySession: vi.fn() }));
vi.mock('@/lib/tenant', () => ({ getTenantContext: vi.fn().mockResolvedValue({ tenantId: null }) }));
vi.mock('@/app/lib/auth-helpers', () => ({ requirePermission: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/inventory-movements', () => ({ recordMovement: vi.fn() }));
vi.mock('@/models/Prescription', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock('@/models/Inventory', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() } }));

import { verifySession } from '@/app/lib/dal';
import Prescription from '@/models/Prescription';
import InventoryItem from '@/models/Inventory';
import { POST } from '@/app/api/prescriptions/[id]/dispense/route';

const TENANT = '507f1f77bcf86cd799439011';
const RX_ID = '507f1f77bcf86cd799439033';
const STOCK_ID = '507f1f77bcf86cd799439044';

const call = (body: unknown) =>
  POST(new NextRequest(`http://localhost/api/prescriptions/${RX_ID}/dispense`, { method: 'POST', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: RX_ID }),
  });

const chain = (value: unknown) => ({ sort: () => ({ select: () => ({ lean: () => Promise.resolve(value) }) }) });

describe('POST /api/prescriptions/[id]/dispense', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifySession).mockResolvedValue({ userId: '507f1f77bcf86cd799439099', email: 'a@b.c', role: 'admin', tenantId: TENANT } as any);
    vi.mocked(Prescription.findOne).mockResolvedValue({
      _id: RX_ID,
      status: 'active',
      medications: [{ name: 'Amoxicillin', quantity: 10 }],
      pharmacyDispenses: [],
    } as any);
    vi.mocked(InventoryItem.findOne).mockReturnValue(chain({ _id: STOCK_ID, quantity: 100 }) as any);
    vi.mocked(InventoryItem.findOneAndUpdate).mockResolvedValue({ quantity: 90 } as any);
  });

  it('adds up repeated lines for one medication before checking what remains', async () => {
    const res = await call({ items: [{ medicationIndex: 0, quantity: 10 }, { medicationIndex: 0, quantity: 10 }] });
    expect(res.status).toBe(400);
    expect(InventoryItem.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('puts the stock back when another dispense was recorded first', async () => {
    vi.mocked(Prescription.findOneAndUpdate).mockResolvedValue(null);
    const res = await call({ items: [{ medicationIndex: 0, quantity: 10 }] });
    expect(res.status).toBe(409);
    expect(InventoryItem.updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: STOCK_ID }), { $inc: { quantity: 10 } });
    const filter = vi.mocked(Prescription.findOneAndUpdate).mock.calls[0][0] as any;
    expect(filter['pharmacyDispenses.0']).toEqual({ $exists: false });
  });

  it('puts the stock back when recording the dispense fails', async () => {
    vi.mocked(Prescription.findOneAndUpdate).mockRejectedValue(new Error('db down'));
    const res = await call({ items: [{ medicationIndex: 0, quantity: 5 }] });
    expect(res.status).toBe(500);
    expect(InventoryItem.updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: STOCK_ID }), { $inc: { quantity: 5 } });
  });
});
