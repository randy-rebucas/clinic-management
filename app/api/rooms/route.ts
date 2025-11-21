import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Room from '@/models/Room';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const roomType = searchParams.get('roomType');
    const status = searchParams.get('status');
    const available = searchParams.get('available');

    let query: any = {};
    if (roomType) {
      query.roomType = roomType;
    }
    if (status) {
      query.status = status;
    }
    if (available === 'true') {
      query.status = 'available';
    }

    const rooms = await Room.find(query).sort({ name: 1 });

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
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const body = await request.json();

    const room = await Room.create(body);

    return NextResponse.json(
      { success: true, data: room },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating room:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
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

