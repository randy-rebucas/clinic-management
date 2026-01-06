import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Room from '@/models/Room';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    const searchParams = request.nextUrl.searchParams;
    const roomType = searchParams.get('roomType');
    const status = searchParams.get('status');
    const available = searchParams.get('available');

    const query: any = {};
    
    // Add tenant filter
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
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
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Ensure room is created with tenantId
    const roomData: any = { ...body };
    if (tenantId && !roomData.tenantId) {
      roomData.tenantId = new Types.ObjectId(tenantId);
    }

    const room = await Room.create(roomData);

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

