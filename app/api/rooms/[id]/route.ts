import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Room from '@/models/Room';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { pickFields, ROOM_FIELDS } from '@/lib/pick-fields';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Room');

    const room = await Room.findOne(tenantFilter(ctx.tenantId, { _id: id })).lean();
    if (!room) return notFound('Room');

    return NextResponse.json({
      success: true,
      data: room,
      message: 'Room updated successfully'
    });
  } catch (error: any) {
    console.error('Error fetching room:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch room' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Room');

    const body = await request.json().catch(() => null);
    const { data, rejected } = pickFields(body, ROOM_FIELDS);
    if (rejected.length) {
      return NextResponse.json({ success: false, error: 'Invalid room data' }, { status: 400 });
    }

    const room = await Room.findOneAndUpdate(tenantFilter(ctx.tenantId, { _id: id }), { $set: data }, {
      new: true,
      runValidators: true,
    });

    if (!room) return notFound('Room');

    return NextResponse.json({
      success: true,
      data: room,
      message: 'Room updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating room:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid room data' },
        { status: 400 }
      );
    }
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, error: 'Room with this name already exists' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update room' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Room');

    const room = await Room.findOneAndDelete(tenantFilter(ctx.tenantId, { _id: id }));
    if (!room) return notFound('Room');

    return NextResponse.json({
      success: true,
      data: {},
      message: 'Room deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting room:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete room' },
      { status: 500 }
    );
  }
}
