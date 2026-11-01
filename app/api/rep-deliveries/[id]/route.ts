import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import RepDelivery, { type IRepDelivery } from '@/models/RepDelivery';
import { isAdmin, refuseAccess, requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { notifyRepOfDelivery, receiveLineIntoStock } from '@/lib/rep-deliveries';

const schema = z.object({
  action: z.enum(['receive', 'reject']),
  /** To the rep: a reason for a rejection, or a remark on what arrived. */
  note: z.string().trim().max(1000).optional(),
  /**
   * On receive, one entry per delivery line, in order: what was counted, and where it goes in
   * stock ("none", "new" for a new stock item, or an existing stock item's id). Leaving it out
   * receives every line as recorded, without touching stock.
   */
  lines: z
    .array(
      z.object({
        receivedQuantity: z.number().int().min(0).max(100000),
        stock: z.string().trim().min(1).default('none'),
      })
    )
    .optional(),
});

/**
 * PATCH /api/rep-deliveries/[id]  { action: "receive" | "reject", note?, lines? }
 * The clinic confirms what a rep delivered, optionally into stock (a restock per line, with the
 * rep's company as supplier and the delivery as reference), or rejects it. Only a pending
 * delivery can be answered (409 DELIVERY_CLOSED). The rep gets a push either way. Stock writes
 * that fail after the receipt is saved are listed in `stockProblems`.
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
      const supplier = delivery.repCompany || delivery.repName;
      const linked: Record<string, unknown> = {};
      for (let i = 0; i < delivery.lines.length; i++) {
        const target = lines[i].stock;
        const quantity = lines[i].receivedQuantity;
        if (target === 'none' || quantity === 0) continue;
        try {
          const itemId = await receiveLineIntoStock({
            tenantId: tenantObjectId,
            deliveryId: delivery._id,
            line: delivery.lines[i],
            quantity,
            target,
            supplier,
            userId: session.userId,
          });
          if (itemId) linked[`lines.${i}.inventoryItemId`] = itemId;
          else stockProblems.push({ line: i, error: 'That stock item no longer exists.' });
        } catch (error) {
          console.error('[rep-deliveries] stock write failed:', error);
          stockProblems.push({ line: i, error: 'Could not add this line to stock.' });
        }
      }
      if (Object.keys(linked).length) await RepDelivery.updateOne({ _id: delivery._id }, { $set: linked });
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
