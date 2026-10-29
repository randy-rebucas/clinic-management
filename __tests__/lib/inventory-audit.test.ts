import { describe, it, expect, vi } from 'vitest';

const TENANT = '507f1f77bcf86cd799439001';
const PARA = '507f1f77bcf86cd799439031';
const AMOX = '507f1f77bcf86cd799439032';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/audit', () => ({ createAuditLog: vi.fn() }));
vi.mock('@/lib/api/tenant-session', () => ({ tenantFilter: (tenantId: string, q = {}) => ({ ...q, tenantId }) }));
vi.mock('@/models/Medicine', () => ({
  default: {
    find: vi.fn(() => ({
      select: () => ({
        lean: async () => [
          { _id: PARA, name: 'Paracetamol' },
          { _id: AMOX, name: 'Amoxicillin' },
        ],
      }),
    })),
  },
}));

const { inventoryChanges, changedSentence, stockWords } = await import('@/app/api/inventory/_lib/inventory-audit');

const base = {
  name: 'Paracetamol 500 mg',
  category: 'medicine',
  unit: 'tablets',
  quantity: 120,
  reorderLevel: 50,
  unitCost: 2.5,
  supplier: 'MedSupply',
  expiryDate: new Date('2027-11-30T00:00:00Z'),
  notes: 'Keep dry',
  medicineId: PARA,
};

describe('inventoryChanges', () => {
  it('logs only the fields that changed, with their values', async () => {
    const changes = await inventoryChanges(TENANT, base, { ...base, unitCost: 3, supplier: 'MedSupply' }, ['unitCost', 'supplier']);
    expect(changes).toEqual([{ field: 'unitCost', oldValue: 2.5, newValue: 3 }]);
  });

  it('reads the category by its label and the expiry as a date', async () => {
    const changes = await inventoryChanges(
      TENANT,
      base,
      { ...base, category: 'supply', expiryDate: new Date('2028-01-15T00:00:00Z') },
      ['category', 'expiryDate']
    );
    expect(changes).toEqual([
      { field: 'category', oldValue: 'Medicine', newValue: 'Supply' },
      { field: 'expiryDate', oldValue: 'Nov 30, 2027', newValue: 'Jan 15, 2028' },
    ]);
  });

  it('names the linked medicine instead of its id, and an unlink as none', async () => {
    expect(await inventoryChanges(TENANT, base, { ...base, medicineId: { _id: AMOX, name: 'Amoxicillin' } }, ['medicineId'])).toEqual([
      { field: 'medicine', oldValue: 'Paracetamol', newValue: 'Amoxicillin' },
    ]);
    expect(await inventoryChanges(TENANT, base, { ...base, medicineId: null }, ['medicineId'])).toEqual([
      { field: 'medicine', oldValue: 'Paracetamol', newValue: null },
    ]);
  });

  it('says the notes changed without copying them', async () => {
    const changes = await inventoryChanges(TENANT, base, { ...base, notes: 'Keep dry, below 30°C' }, ['notes']);
    expect(changes).toEqual([{ field: 'notes', oldValue: null, newValue: null }]);
  });

  it('treats an empty value and a missing one as the same', async () => {
    expect(await inventoryChanges(TENANT, { ...base, location: undefined }, { ...base, location: '' }, ['location'])).toEqual([]);
  });

  it('ignores fields that were not sent', async () => {
    expect(await inventoryChanges(TENANT, base, { ...base, unitCost: 9 }, ['supplier'])).toEqual([]);
  });
});

describe('wording', () => {
  it('names the changed fields as the form does', () => {
    expect(
      changedSentence('Paracetamol 500 mg', [
        { field: 'unitCost', oldValue: 2.5, newValue: 3 },
        { field: 'medicine', oldValue: null, newValue: 'Paracetamol' },
      ])
    ).toBe('Changed Paracetamol 500 mg: unit cost, linked medicine');
  });

  it('gives stock with its unit', () => {
    expect(stockWords(1200, 'tablets')).toBe('1,200 tablets');
    expect(stockWords(0)).toBe('0');
  });
});
