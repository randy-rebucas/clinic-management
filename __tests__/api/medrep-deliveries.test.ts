import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/app/api/medical-representatives/_lib/rep-session', () => ({
  requireRepSession: vi.fn(),
  isRepSessionError: () => false,
}));
vi.mock('@/app/api/medical-representatives/_lib/rep-visit-input', async (orig) => ({
  ...(await orig<typeof import('@/app/api/medical-representatives/_lib/rep-visit-input')>()),
  loadRepProfileForVisits: vi.fn(),
}));
vi.mock('@/lib/api/tenant-session', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/tenant-session')>()),
  requireTenantSession: vi.fn(),
  isTenantSessionError: () => false,
}));
vi.mock('@/app/lib/auth-helpers', () => ({
  isAdmin: vi.fn(() => true),
  refuseAccess: vi.fn(() => new Response(null, { status: 403 })),
  requirePermission: vi.fn(async () => null),
}));
vi.mock('@/models/MedicalRepresentativeVisit', () => ({ default: { findOne: vi.fn(), find: vi.fn() } }));
vi.mock('@/models/Product', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/RepDelivery', async (orig) => ({
  ...(await orig<typeof import('@/models/RepDelivery')>()),
  default: { create: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), exists: vi.fn() },
}));
vi.mock('@/lib/rep-deliveries', async (orig) => ({
  ...(await orig<typeof import('@/lib/rep-deliveries')>()),
  notifyClinicOfDelivery: vi.fn(),
  notifyRepOfDelivery: vi.fn(),
}));
vi.mock('@/lib/inventory-stock', () => ({ applyStockChange: vi.fn() }));
vi.mock('@/app/api/inventory/_lib/create-item', () => ({ createInventoryItem: vi.fn() }));
vi.mock('@/models/Inventory', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/RepStockLink', () => ({ default: { updateOne: vi.fn() } }));

import { Types } from 'mongoose';
import { requireRepSession } from '@/app/api/medical-representatives/_lib/rep-session';
import { loadRepProfileForVisits } from '@/app/api/medical-representatives/_lib/rep-visit-input';
import { requireTenantSession } from '@/lib/api/tenant-session';
import { requirePermission } from '@/app/lib/auth-helpers';
import MedicalRepresentativeVisit from '@/models/MedicalRepresentativeVisit';
import Product from '@/models/Product';
import RepDelivery from '@/models/RepDelivery';
import InventoryItem from '@/models/Inventory';
import RepStockLink from '@/models/RepStockLink';
import { deliveryClinicOf, notifyClinicOfDelivery, notifyRepOfDelivery } from '@/lib/rep-deliveries';
import { applyStockChange } from '@/lib/inventory-stock';
import { createInventoryItem } from '@/app/api/inventory/_lib/create-item';
import { POST as record } from '@/app/api/medical-representatives/deliveries/route';
import { DELETE as cancel } from '@/app/api/medical-representatives/deliveries/[id]/route';
import { PATCH as answer } from '@/app/api/rep-deliveries/[id]/route';

const USER = new Types.ObjectId('507f1f77bcf86cd7994390aa');
const CLINIC = new Types.ObjectId('507f1f77bcf86cd7994390cc');
const VISIT = '507f1f77bcf86cd7994390dd';
const PRODUCT = '507f1f77bcf86cd7994390ee';
const DELIVERY = '507f1f77bcf86cd7994390ff';
const ADMIN = '507f1f77bcf86cd799439011';
const BODY = { visitId: VISIT, kind: 'sample', lines: [{ productId: PRODUCT, quantity: 20, unit: 'boxes', lotNumber: 'L42' }] };

const lean = <T,>(value: T) => ({ select: () => ({ lean: async () => value }), lean: async () => value });
const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('deliveryClinicOf', () => {
  it('takes approved or completed bookings and linked own logs only', () => {
    expect(String(deliveryClinicOf({ clinicId: CLINIC, status: 'scheduled' }))).toBe(String(CLINIC));
    expect(String(deliveryClinicOf({ clinicId: CLINIC, status: 'completed' }))).toBe(String(CLINIC));
    for (const status of ['requested', 'declined', 'cancelled', 'no-show']) expect(deliveryClinicOf({ clinicId: CLINIC, status })).toBeNull();
    expect(String(deliveryClinicOf({ linkedClinicId: CLINIC, status: 'completed' }))).toBe(String(CLINIC));
    expect(deliveryClinicOf({ linkedClinicId: CLINIC, status: 'cancelled' })).toBeNull();
    expect(deliveryClinicOf({ status: 'completed' })).toBeNull();
  });
});

describe('POST /api/medical-representatives/deliveries', () => {
  const post = (body: unknown) => record(json('http://x/api/medical-representatives/deliveries', 'POST', body));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRepSession).mockResolvedValue({ userObjectId: USER, ownerFilter: { userId: USER } } as any);
    vi.mocked(MedicalRepresentativeVisit.findOne).mockReturnValue(
      lean({ _id: new Types.ObjectId(VISIT), clinicId: CLINIC, clinicName: 'Sunrise Clinic', status: 'completed' }) as any
    );
    vi.mocked(Product.find).mockReturnValue(
      lean([
        { _id: new Types.ObjectId(PRODUCT), name: 'Amlodipine', strength: '5 mg', expiryDate: new Date('2027-03-31'), packSize: { count: 30, unit: 'tablets' } },
      ]) as any
    );
    vi.mocked(loadRepProfileForVisits).mockResolvedValue({ _id: new Types.ObjectId(), firstName: 'Ana', lastName: 'Cruz', company: 'Acme Pharma' } as any);
    vi.mocked(RepDelivery.create).mockImplementation(async (doc: any) => ({ _id: DELIVERY, ...doc, toObject: () => ({ _id: DELIVERY, ...doc }) }));
  });

  it('records the lines against the visit’s clinic, snapshots the product and tells the clinic', async () => {
    const res = await post(BODY);
    expect(res.status).toBe(200);
    const doc = vi.mocked(RepDelivery.create).mock.calls[0][0] as any;
    expect(doc).toMatchObject({ userId: USER, clinicId: CLINIC, clinicName: 'Sunrise Clinic', repName: 'Ana Cruz', repCompany: 'Acme Pharma', kind: 'sample' });
    expect(doc.lines[0]).toMatchObject({ productName: 'Amlodipine', strength: '5 mg', quantity: 20, unit: 'boxes', lotNumber: 'L42', packSize: { count: 30, unit: 'tablets' } });
    // No expiry on the line: the product's.
    expect(doc.lines[0].expiryDate).toEqual(new Date('2027-03-31'));
    expect(notifyClinicOfDelivery).toHaveBeenCalledOnce();
  });

  it('409 for a visit that can’t carry a delivery', async () => {
    vi.mocked(MedicalRepresentativeVisit.findOne).mockReturnValue(lean({ _id: VISIT, clinicId: CLINIC, clinicName: 'X', status: 'requested' }) as any);
    const res = await post(BODY);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('VISIT_CANT_DELIVER');
    expect(RepDelivery.create).not.toHaveBeenCalled();
  });

  it('400 for a product that isn’t the rep’s own active one', async () => {
    vi.mocked(Product.find).mockReturnValue(lean([]) as any);
    expect(await (await post(BODY)).json()).toMatchObject({ code: 'INVALID_PRODUCTS' });
  });

  it('refuses no lines, a zero quantity and a loose date', async () => {
    expect((await post({ ...BODY, lines: [] })).status).toBe(400);
    expect((await post({ ...BODY, lines: [{ ...BODY.lines[0], quantity: 0 }] })).status).toBe(400);
    expect((await post({ ...BODY, lines: [{ ...BODY.lines[0], expiryDate: '31/03/2027' }] })).status).toBe(400);
  });
});

describe('DELETE /api/medical-representatives/deliveries/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireRepSession).mockResolvedValue({ userObjectId: USER, ownerFilter: { userId: USER } } as any);
  });

  it('cancels a pending delivery and keeps an answered one', async () => {
    vi.mocked(RepDelivery.findOneAndUpdate).mockReturnValueOnce(lean({ _id: DELIVERY }) as any);
    expect((await cancel(json('http://x', 'DELETE'), ctx(DELIVERY))).status).toBe(200);
    vi.mocked(RepDelivery.findOneAndUpdate).mockReturnValueOnce(lean(null) as any);
    vi.mocked(RepDelivery.exists).mockResolvedValueOnce({ _id: DELIVERY } as any);
    const res = await cancel(json('http://x', 'DELETE'), ctx(DELIVERY));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('DELIVERY_CLOSED');
  });
});

describe('PATCH /api/rep-deliveries/[id]', () => {
  const ITEM = '507f1f77bcf86cd799439099';
  const LINES = [
    { productId: new Types.ObjectId(PRODUCT), productName: 'Amlodipine', strength: '5 mg', quantity: 20, unit: 'Boxes', lotNumber: 'L42', expiryDate: new Date('2027-03-31') },
    { productId: new Types.ObjectId(), productName: 'Losartan', quantity: 10, unit: 'boxes' },
  ];
  const patch = (body: unknown) => answer(json('http://x/api/rep-deliveries/' + DELIVERY, 'PATCH', body), ctx(DELIVERY));
  const restockCall = () => vi.mocked(applyStockChange).mock.calls[0][0];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantSession).mockResolvedValue({ session: { userId: ADMIN }, tenantObjectId: CLINIC, tenantId: String(CLINIC) } as any);
    vi.mocked(RepDelivery.findOne).mockReturnValue(lean({ status: 'pending', lines: LINES }) as any);
    vi.mocked(RepDelivery.findOneAndUpdate).mockReturnValue(
      lean({ _id: DELIVERY, userId: USER, clinicName: 'Sunrise Clinic', repName: 'Ana Cruz', repCompany: 'Acme Pharma', kind: 'delivery', lines: LINES }) as any
    );
    vi.mocked(InventoryItem.findOne).mockReturnValue(lean({ quantity: 12 }) as any);
    vi.mocked(applyStockChange).mockResolvedValue({ ok: true, item: {}, restocking: true, discarding: false });
    vi.mocked(createInventoryItem).mockResolvedValue({ ok: true, item: { _id: new Types.ObjectId(ITEM) } });
  });

  it('receives into an existing item, converting boxes to tablets, and remembers the choice', async () => {
    const res = await patch({
      action: 'receive',
      lines: [
        { receivedQuantity: 18, unitsPerPack: 30, stock: { itemId: ITEM } },
        { receivedQuantity: 10, stock: 'none' },
      ],
    });
    expect(res.status).toBe(200);
    const [filter, update] = vi.mocked(RepDelivery.findOneAndUpdate).mock.calls[0] as any;
    expect(filter).toMatchObject({ status: 'pending', clinicId: CLINIC });
    expect(update.$set).toMatchObject({ status: 'received', 'lines.0.receivedQuantity': 18, 'lines.1.receivedQuantity': 10 });

    expect(applyStockChange).toHaveBeenCalledOnce();
    expect(restockCall().current).toEqual({ quantity: 12 });
    expect(restockCall().input).toMatchObject({
      delta: 540,
      kind: 'restock',
      discardExpired: true,
      batchExpiry: new Date('2027-03-31'),
      ledger: { supplier: 'Acme Pharma' },
      reference: `Rep delivery ${DELIVERY} · lot L42`,
    });
    // The item's own supplier and cost are left alone.
    expect(restockCall().input.fields).toEqual({});

    expect(vi.mocked(RepStockLink.updateOne).mock.calls[0]).toEqual([
      { tenantId: CLINIC, productId: LINES[0].productId, deliveryUnit: 'boxes' },
      { $set: { inventoryItemId: new Types.ObjectId(ITEM), unitsPerPack: 30, updatedBy: ADMIN } },
      { upsert: true },
    ]);
    expect((vi.mocked(RepDelivery.updateOne).mock.calls[0] as unknown[])[1]).toEqual({
      $set: { 'lines.0.inventoryItemId': new Types.ObjectId(ITEM), 'lines.0.unitsPerPack': 30, 'lines.0.stockQuantity': 540 },
    });
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), 'inventory', 'write');
    expect(notifyRepOfDelivery).toHaveBeenCalledWith(expect.anything(), 'received', undefined);
  });

  it('adds a new item the way /inventory/new does, then restocks it', async () => {
    await patch({
      action: 'receive',
      lines: [
        { receivedQuantity: 20, unitsPerPack: 30, stock: { create: { name: 'Amlodipine 5 mg tablet', unit: 'tablets', medicineId: ITEM, reorderLevel: 60 } } },
        { receivedQuantity: 10, stock: 'none' },
      ],
    });
    expect(vi.mocked(createInventoryItem).mock.calls[0][2]).toEqual({
      name: 'Amlodipine 5 mg tablet',
      unit: 'tablets',
      medicineId: ITEM,
      reorderLevel: 60,
      category: 'medicine',
      quantity: 0,
    });
    expect(restockCall().current).toEqual({ quantity: 0 });
    expect(restockCall().input.delta).toBe(600);
  });

  it('reads the stock again once when it moved meanwhile', async () => {
    vi.mocked(applyStockChange).mockResolvedValueOnce({ ok: false, reason: 'changed' });
    const res = await patch({ action: 'receive', lines: [{ receivedQuantity: 1, stock: { itemId: ITEM } }, { receivedQuantity: 1, stock: 'none' }] });
    expect(applyStockChange).toHaveBeenCalledTimes(2);
    expect((await res.json()).stockProblems).toBeUndefined();
  });

  it('receives as recorded without touching stock when lines are left out', async () => {
    await patch({ action: 'receive' });
    const update = vi.mocked(RepDelivery.findOneAndUpdate).mock.calls[0][1] as any;
    expect(update.$set).toMatchObject({ 'lines.0.receivedQuantity': 20, 'lines.1.receivedQuantity': 10 });
    expect(applyStockChange).not.toHaveBeenCalled();
    expect(requirePermission).not.toHaveBeenCalled();
  });

  it('rejects with a note for the rep', async () => {
    await patch({ action: 'reject', note: 'Not ordered' });
    expect((vi.mocked(RepDelivery.findOneAndUpdate).mock.calls[0][1] as any).$set).toMatchObject({ status: 'rejected', clinicNote: 'Not ordered' });
    expect(notifyRepOfDelivery).toHaveBeenCalledWith(expect.anything(), 'rejected', 'Not ordered');
  });

  it('409 once answered, also when a second admin got there first', async () => {
    vi.mocked(RepDelivery.findOne).mockReturnValueOnce(lean({ status: 'received', lines: LINES }) as any);
    expect((await (await patch({ action: 'receive' })).json()).code).toBe('DELIVERY_CLOSED');
    vi.mocked(RepDelivery.findOneAndUpdate).mockReturnValueOnce(lean(null) as any);
    expect((await (await patch({ action: 'receive' })).json()).code).toBe('DELIVERY_CLOSED');
    expect(applyStockChange).not.toHaveBeenCalled();
  });

  it('needs one entry per line, a whole conversion, and inventory write to touch stock', async () => {
    expect((await patch({ action: 'receive', lines: [{ receivedQuantity: 1, stock: 'none' }] })).status).toBe(400);
    expect((await patch({ action: 'receive', lines: [{ receivedQuantity: 1, unitsPerPack: 0 }, { receivedQuantity: 1 }] })).status).toBe(400);
    vi.mocked(requirePermission).mockResolvedValueOnce(new Response(null, { status: 403 }) as any);
    expect((await patch({ action: 'receive', lines: [{ receivedQuantity: 1, stock: { itemId: ITEM } }, { receivedQuantity: 1 }] })).status).toBe(403);
  });

  it('lists lines that couldn’t go into stock without undoing the receipt', async () => {
    vi.mocked(InventoryItem.findOne).mockReturnValueOnce(lean(null) as any);
    vi.mocked(createInventoryItem).mockResolvedValueOnce({ ok: false, status: 400, error: 'Invalid medicine selected. Please select a medicine from this clinic.' });
    const res = await patch({
      action: 'receive',
      lines: [
        { receivedQuantity: 20, stock: { itemId: ITEM } },
        { receivedQuantity: 10, stock: { create: { name: 'Losartan', unit: 'boxes', medicineId: ITEM } } },
      ],
    });
    expect(res.status).toBe(200);
    expect((await res.json()).stockProblems).toEqual([
      { line: 0, error: 'That stock item no longer exists.' },
      { line: 1, error: 'Invalid medicine selected. Please select a medicine from this clinic.' },
    ]);
    expect(RepStockLink.updateOne).not.toHaveBeenCalled();
  });
});
