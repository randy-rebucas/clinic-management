import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Room from '@/models/Room';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { isRoomType } from '@/lib/rooms';
import { roomCreateSchema } from './schema';

/**
 * GET: the clinic's rooms, by name. `roomType`, `status`, and `available=true` (open rooms,
 * including ones once marked "occupied" by hand) narrow it. Needs rooms:read (doctors, nurses
 * and the front desk have it).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'rooms', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const roomType = searchParams.get('roomType');
    const status = searchParams.get('status');

    const query: Record<string, unknown> = { tenantId: ctx.tenantObjectId };
    if (isRoomType(roomType)) query.roomType = roomType;
    if (status === 'maintenance' || status === 'unavailable') query.status = status;
    if (status === 'available' || searchParams.get('available') === 'true') query.status = { $in: ['available', 'occupied'] };

    const rooms = await Room.find(query)
      .select('name roomNumber building floor roomType capacity equipment amenities status notes createdAt updatedAt')
      .sort({ name: 1 })
      .limit(500)
      .lean();

    return NextResponse.json({ success: true, data: rooms });
  } catch (error) {
    console.error('Error fetching rooms:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch rooms' }, { status: 500 });
  }
}

/** POST: add a room. Blank optional fields are left off. Audited. */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'rooms', 'write');
  if (permissionCheck) return permissionCheck;

  const parsed = await parseBody(request, roomCreateSchema);
  if (isValidationError(parsed)) return parsed;
  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) if (value !== undefined && value !== '') input[key] = value;

  try {
    await connectDB();
    const room = await Room.create({ ...input, status: input.status ?? 'available', tenantId: ctx.tenantObjectId });

    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'create',
      resource: 'room',
      resourceId: String(room._id),
      description: `Added the room ${room.name}`,
    });

    return NextResponse.json({ success: true, data: room, message: 'Room added' }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating room:', error);
    if (error?.code === 11000) {
      return NextResponse.json({ success: false, error: `There is already a room called ${String(input.name)}.` }, { status: 409 });
    }
    if (error?.name === 'ValidationError') {
      return NextResponse.json({ success: false, error: 'Invalid room data' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Failed to add the room' }, { status: 500 });
  }
}
