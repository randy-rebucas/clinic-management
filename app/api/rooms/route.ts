import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Room from '@/models/Room';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { pickFields, ROOM_FIELDS } from '@/lib/pick-fields';

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const roomType = searchParams.get('roomType');
    const status = searchParams.get('status');
    const available = searchParams.get('available');

    const query: any = { tenantId: ctx.tenantObjectId };
    if (roomType) {
      query.roomType = String(roomType);
    }
    if (status) {
      query.status = String(status);
    }
    if (available === 'true') {
      query.status = 'available';
    }

    const rooms = await Room.find(query).sort({ name: 1 }).limit(500).lean();

    return NextResponse.json({ success: true, data: rooms });
  } catch (error: any) {
    console.error('Error fetching rooms:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch rooms' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  try {
    await connectDB();
    const body = await request.json().catch(() => null);
    const { data, rejected } = pickFields(body, ROOM_FIELDS);
    if (rejected.length) {
      return NextResponse.json({ success: false, error: 'Invalid room data' }, { status: 400 });
    }

    const room = await Room.create({ ...data, tenantId: ctx.tenantObjectId });

    return NextResponse.json(
      {
        success: true,
        data: room,
        message: 'Room created successfully'
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating room:', error);
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
      { success: false, error: 'Failed to create room' },
      { status: 500 }
    );
  }
}
