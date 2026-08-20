import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { listRooms, createRoom } from '@/lib/data/room';

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const searchParams = request.nextUrl.searchParams;
    const roomType = searchParams.get('roomType');
    const status = searchParams.get('status');
    const available = searchParams.get('available');

    const opts = {
      roomType: roomType || undefined,
      status: status || undefined,
      onlyAvailable: available === 'true',
    };

    const rooms = tenantId
      ? await runWithTenant(tenantId, () => listRooms(opts))
      : await runAsSystem(() => listRooms(opts));

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
    const body = await request.json();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const room = tenantId
      ? await runWithTenant(tenantId, () => createRoom(body))
      : await runAsSystem(() => createRoom(body));

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
    if (error.code === 'P2002') {
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
