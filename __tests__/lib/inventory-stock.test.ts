import { describe, it, expect, vi } from 'vitest';

vi.mock('@/models/Inventory', () => ({ default: {} }));
vi.mock('@/lib/inventory-movements', () => ({ recordMovement: vi.fn() }));

import { planStockChange } from '@/lib/inventory-stock';

const now = new Date('2026-11-01T00:00:00Z');
const opts = { now, performedBy: 'u1' };
const past = new Date('2026-10-01T00:00:00Z');
const soon = new Date('2027-01-31T00:00:00Z');
const later = new Date('2027-06-30T00:00:00Z');

describe('planStockChange', () => {
  it('restocks atomically with a ledger line carrying the delivery', () => {
    const p = planStockChange({ quantity: 10 }, { fields: { supplier: 'Zuellig', unitCost: 4 }, delta: 50, kind: 'restock', reference: 'DR-1', batchExpiry: later }, opts);
    expect(p.restocking).toBe(true);
    expect(p.update.$inc).toEqual({ quantity: 50 });
    expect(p.guard).toEqual({});
    expect(p.update.$set).toMatchObject({ supplier: 'Zuellig', unitCost: 4, lastRestocked: now, lastRestockedBy: 'u1', expiryDate: later });
    expect(p.lines).toEqual([{ type: 'restock', change: 50, unitCost: 4, supplier: 'Zuellig', reference: 'DR-1', batchExpiry: later }]);
  });

  it('puts a ledger-only supplier on the line without changing the item', () => {
    const p = planStockChange({ quantity: 10 }, { fields: {}, delta: 600, kind: 'restock', ledger: { supplier: 'Acme Pharma' } }, opts);
    expect((p.update.$set as any).supplier).toBeUndefined();
    expect(p.lines[0]).toMatchObject({ type: 'restock', change: 600, supplier: 'Acme Pharma' });
  });

  it('takes expired units off before restocking, guarded on the stock read', () => {
    const p = planStockChange({ quantity: 7, expiryDate: past }, { fields: {}, delta: 30, kind: 'restock', discardExpired: true, batchExpiry: later }, opts);
    expect(p.discarding).toBe(true);
    expect(p.guard).toEqual({ quantity: 7 });
    expect(p.update.$inc).toBeUndefined();
    expect(p.update.$set).toMatchObject({ quantity: 30, expiryDate: later });
    expect(p.lines.map((l) => [l.type, l.change, l.quantityAfter])).toEqual([
      ['adjustment', -7, 0],
      ['restock', 30, undefined],
    ]);
  });

  it('keeps the earlier expiry while that batch is still on the shelf', () => {
    const keep = planStockChange({ quantity: 5, expiryDate: soon }, { fields: {}, delta: 10, kind: 'restock', batchExpiry: later }, opts);
    expect((keep.update.$set as any).expiryDate).toBeUndefined();
    const empty = planStockChange({ quantity: 0, expiryDate: soon }, { fields: {}, delta: 10, kind: 'restock', batchExpiry: later }, opts);
    expect((empty.update.$set as any).expiryDate).toEqual(later);
  });

  it('guards a take-off on having enough, and a count on the stock read', () => {
    const off = planStockChange({ quantity: 10 }, { fields: {}, delta: -3, kind: 'adjustment', reasonCode: 'damaged' }, opts);
    expect(off.guard).toEqual({ quantity: { $gte: 3 } });
    expect(off.lines[0]).toEqual({ type: 'adjustment', change: -3, reasonCode: 'damaged' });
    const count = planStockChange({ quantity: 10 }, { fields: { quantity: 8 }, kind: 'count' }, opts);
    expect(count.guard).toEqual({ quantity: 10 });
    expect(count.lines[0]).toEqual({ type: 'count', change: -2 });
  });

  it('an edit with no stock change writes no ledger line', () => {
    const p = planStockChange({ quantity: 10 }, { fields: { location: 'Shelf B2', sku: undefined }, expiryDate: null }, opts);
    expect(p.lines).toEqual([]);
    expect(p.update).toEqual({ $set: { location: 'Shelf B2' }, $unset: { expiryDate: 1 } });
  });
});
