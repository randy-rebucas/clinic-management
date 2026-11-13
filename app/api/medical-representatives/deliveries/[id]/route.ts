import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import RepDelivery from '@/models/RepDelivery';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { requireRepSession, isRepSessionError } from '../../_lib/rep-session';
import { visitError } from '../../_lib/rep-visit-input';

/**
 * DELETE /api/medical-representatives/deliveries/[id]
 * Cancel a delivery the clinic hasn't answered (a mistake). Once the clinic has received or
 * rejected it, it stays as the record: 409 DELIVERY_CLOSED.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const { id } = await params;
    if (!isValidId(id)) return notFound('Delivery');

    await connectDB();
    const updated = await RepDelivery.findOneAndUpdate(
      { ...rep.ownerFilter, _id: id, status: 'pending' },
      { $set: { status: 'cancelled' } },
      { new: true }
    ).lean();
    if (!updated) {
      const exists = await RepDelivery.exists({ ...rep.ownerFilter, _id: id });
      if (!exists) return notFound('Delivery');
      return visitError(409, 'The clinic has already answered this delivery.', 'DELIVERY_CLOSED');
    }
    return NextResponse.json({ success: true, message: 'Delivery cancelled' });
  } catch (error) {
    console.error('Cancel rep delivery error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
