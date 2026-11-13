import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import InventoryItem from '@/models/Inventory';
import RepDelivery, { type IRepDelivery } from '@/models/RepDelivery';
import RepStockLink from '@/models/RepStockLink';
import { isAdmin, refuseAccess, requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter, type TenantSession } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zMoney, zObjectId, zShortText } from '@/lib/api/validate';
import { applyStockChange, type StockCurrent } from '@/lib/inventory-stock';
import { notifyRepOfDelivery } from '@/lib/rep-deliveries';
import { createInventoryItem } from '../../inventory/_lib/create-item';

/** A new stock item for a delivered product: the essentials of /inventory/new. */
const newItemSchema = z.object({
  name: zShortText.min(1),
  /** What the clinic counts and dispenses it in ("tablets"). */
  unit: zShortText.min(1),
  medicineId: zObjectId.optional(),
  reorderLevel: z.number().finite().min(0).max(100_000_000).optional(),
  unitCost: zMoney.optional(),
  location: zShortText.optional(),
});

const schema = z.object({
  action: z.enum(['receive', 'reject']),
  /** To the rep: a reason for a rejection, or a remark on what arrived. */
  note: z.string().trim().max(1000).optional(),
  /**
   * On receive, one entry per delivery line, in order: what was counted, and where it goes in
   * stock. Leaving it out receives every line as recorded, without touching stock.
   */
  lines: z
    .array(
      z.object({
        receivedQuantity: z.number().int().min(0).max(100000),
        /** Stock units in one delivered unit (30 tablets per box); 1 when they're the same unit. */
        unitsPerPack: z.number().int().min(1).max(100000).default(1),
        stock: z.union([z.literal('none'), z.object({ itemId: zObjectId }), z.object({ create: newItemSchema })]).default('none'),
      })
    )
    .optional(),
});

type LineChoice = NonNullable<z.infer<typeof schema>['lines']>[number];
type Line = IRepDelivery['lines'][number];

/**
 * Put one received line into stock, as a restock through the same code as Inventory → Restock
 * (expired leftovers off first, one expiry per item, a ledger line with the rep's company and the
 * delivery as reference). A new item is added first, as /inventory/new adds one (with no stock),
 * so its history reads "added", then "restocked from the rep". The choice is remembered for the
 * next delivery of this product.
 */
async function receiveIntoStock(
  ctx: TenantSession,
  request: NextRequest,
  delivery: Pick<IRepDelivery, 'repName' | 'repCompany'> & { _id: unknown },
  line: Line,
  choice: LineChoice
): Promise<{ itemId: Types.ObjectId; stockQuantity: number } | { error: string }> {
  const stock = choice.stock;
  if (stock === 'none') return { error: 'No stock target.' };
  const stockQuantity = choice.receivedQuantity * choice.unitsPerPack;

  let itemId: Types.ObjectId;
  let current: StockCurrent | null;
  if ('create' in stock) {
    const created = await createInventoryItem(ctx, request, { ...stock.create, category: 'medicine', quantity: 0 });
    if (!created.ok) return { error: created.error };
    itemId = created.item._id;
    current = { quantity: 0 };
  } else {
    itemId = new Types.ObjectId(stock.itemId);
    current = await InventoryItem.findOne(tenantFilter(ctx.tenantId, { _id: itemId })).select('quantity expiryDate').lean<StockCurrent | null>();
    if (!current) return { error: 'That stock item no longer exists.' };
  }

  const reference = `Rep delivery ${String(delivery._id)}${line.lotNumber ? ` · lot ${line.lotNumber}` : ''}`;
  const filter = tenantFilter(ctx.tenantId, { _id: itemId });
  const restock = (cur: StockCurrent) =>
    applyStockChange({
      filter,
      tenantId: ctx.tenantObjectId,
      current: cur,
      input: {
        fields: {},
        delta: stockQuantity,
        kind: 'restock',
        reference,
        batchExpiry: line.expiryDate,
        discardExpired: true,
        ledger: { supplier: delivery.repCompany || delivery.repName },
      },
      performedBy: ctx.session.userId,
    });

  let result = await restock(current);
  // Discarding expired units is guarded on the stock read; if a dispense landed meanwhile, read again once.
  if (!result.ok && result.reason === 'changed') {
    const again = await InventoryItem.findOne(filter).select('quantity expiryDate').lean<StockCurrent | null>();
    if (again) result = await restock(again);
  }
  if (!result.ok) return { error: result.reason === 'not-found' ? 'That stock item no longer exists.' : 'The stock changed meanwhile; restock this line from Inventory.' };

  await RepStockLink.updateOne(
    { tenantId: ctx.tenantObjectId, productId: line.productId, deliveryUnit: line.unit.toLowerCase() },
    { $set: { inventoryItemId: itemId, unitsPerPack: choice.unitsPerPack, updatedBy: ctx.session.userId } },
    { upsert: true }
  );
  return { itemId, stockQuantity };
}

/**
 * PATCH /api/rep-deliveries/[id]  { action: "receive" | "reject", note?, lines? }
 * The clinic confirms what a rep delivered, optionally into stock (an existing item or a new one,
 * converting delivered units to stock units), or rejects it. Only a pending delivery can be
 * answered (409 DELIVERY_CLOSED). The rep gets a push either way. Lines that couldn't go into
 * stock after the receipt is saved are listed in `stockProblems`.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantSession();
    if (isTenantSessionError(ctx)) return ctx;
    const { session, tenantObjectId } = ctx;
    if (!isAdmin(session)) return refuseAccess(session, 'Admin access required', 'medical-representatives', 'write');

    const { id } = await params;
    if (!isValidId(id)) return notFound('Delivery');
    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;
    const { action, note, lines } = parsed.data;

    if (lines?.some((l) => l.stock !== 'none')) {
      const denied = await requirePermission(session, 'inventory', 'write');
      if (denied) return denied;
    }

    await connectDB();
    const current = await RepDelivery.findOne({ _id: id, clinicId: tenantObjectId }).select('status lines').lean<Pick<IRepDelivery, 'status' | 'lines'> | null>();
    if (!current) return notFound('Delivery');
    if (current.status !== 'pending') {
      return NextResponse.json({ success: false, error: `This delivery is already ${current.status}.`, code: 'DELIVERY_CLOSED' }, { status: 409 });
    }
    if (action === 'receive' && lines && lines.length !== current.lines.length) {
      return NextResponse.json({ success: false, error: 'Send one entry per delivery line.' }, { status: 400 });
    }

    const now = new Date();
    const $set: Record<string, unknown> = {
      status: action === 'receive' ? 'received' : 'rejected',
      respondedAt: now,
      respondedBy: session.userId,
      ...(note ? { clinicNote: note } : {}),
    };
    if (action === 'receive') {
      current.lines.forEach((l, i) => {
        $set[`lines.${i}.receivedQuantity`] = lines ? lines[i].receivedQuantity : l.quantity;
      });
    }

    // Claimed while still pending, so a double click or a second admin can't receive it twice.
    const delivery = await RepDelivery.findOneAndUpdate({ _id: id, clinicId: tenantObjectId, status: 'pending' }, { $set }, { new: true }).lean<
      IRepDelivery & { _id: unknown }
    >();
    if (!delivery) {
      return NextResponse.json({ success: false, error: 'Someone answered this delivery just now.', code: 'DELIVERY_CLOSED' }, { status: 409 });
    }

    const stockProblems: { line: number; error: string }[] = [];
    if (action === 'receive' && lines) {
      const stocked: Record<string, unknown> = {};
      for (let i = 0; i < delivery.lines.length; i++) {
        if (lines[i].stock === 'none' || lines[i].receivedQuantity === 0) continue;
        try {
          const done = await receiveIntoStock(ctx, request, delivery, delivery.lines[i], lines[i]);
          if ('error' in done) {
            stockProblems.push({ line: i, error: done.error });
            continue;
          }
          stocked[`lines.${i}.inventoryItemId`] = done.itemId;
          stocked[`lines.${i}.unitsPerPack`] = lines[i].unitsPerPack;
          stocked[`lines.${i}.stockQuantity`] = done.stockQuantity;
        } catch (error) {
          console.error('[rep-deliveries] stock write failed:', error);
          stockProblems.push({ line: i, error: 'Could not add this line to stock.' });
        }
      }
      if (Object.keys(stocked).length) await RepDelivery.updateOne({ _id: delivery._id }, { $set: stocked });
    }

    await notifyRepOfDelivery(delivery, action === 'receive' ? 'received' : 'rejected', note);

    return NextResponse.json({
      success: true,
      message: action === 'receive' ? 'Delivery received. The rep has been told.' : 'Delivery rejected. The rep has been told.',
      ...(stockProblems.length ? { stockProblems } : {}),
    });
  } catch (error) {
    console.error('Answer rep delivery error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update the delivery' }, { status: 500 });
  }
}
