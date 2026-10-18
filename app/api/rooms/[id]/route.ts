import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Room from '@/models/Room';
import Queue from '@/models/Queue';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { ROOM_STATUS, roomStatusOf } from '@/lib/rooms';
import { ROOM_CLEARABLE, roomUpdateSchema } from '../schema';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'rooms', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Room');

    const room = await Room.findOne(tenantFilter(ctx.tenantId, { _id: id })).lean();
    if (!room) return notFound('Room');

    return NextResponse.json({ success: true, data: room });
  } catch (error) {
    console.error('Error fetching room:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch room' }, { status: 500 });
  }
}

/**
 * PUT: change a room. Blank optional fields are removed (the old form wrote floor 1, capacity 4
 * and "Main Building" onto rooms that had none, and nothing could be cleared). Audited with the
 * old and new values.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'rooms', 'write');
  if (permissionCheck) return permissionCheck;

  const { id } = await params;
  if (!isValidId(id)) return notFound('Room');

  const parsed = await parseBody(request, roomUpdateSchema);
  if (isValidationError(parsed)) return parsed;

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ''> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    if ((ROOM_CLEARABLE as readonly string[]).includes(key) && (value === '' || value === null)) $unset[key] = '';
    else $set[key] = value;
  }

  try {
    await connectDB();

    const before = await Room.findOne(tenantFilter(ctx.tenantId, { _id: id })).lean<Record<string, unknown> | null>();
    if (!before) return notFound('Room');

    const room = await Room.findOneAndUpdate(
      tenantFilter(ctx.tenantId, { _id: id }),
      { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
      { new: true, runValidators: true }
    );
    if (!room) return notFound('Room');

    const after = room.toObject() as Record<string, unknown>;
    const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const changes = [...Object.keys($set), ...Object.keys($unset)]
      .filter((field) => !same(before[field], after[field]))
      .map((field) => ({ field, oldValue: before[field] ?? null, newValue: after[field] ?? null }));
    if (changes.length) {
      const status = changes.find((c) => c.field === 'status');
      await createAuditLog({
        userId: ctx.session.userId,
        userEmail: ctx.session.email,
        userRole: ctx.session.role,
        tenantId: ctx.tenantId,
        action: 'update',
        resource: 'room',
        resourceId: String(room._id),
        description: status
          ? `Marked ${room.name} ${ROOM_STATUS[roomStatusOf(status.newValue)].label.toLowerCase()} (was ${ROOM_STATUS[roomStatusOf(status.oldValue)].label.toLowerCase()})`
          : `Changed ${room.name}: ${changes.map((c) => c.field).join(', ')}`,
        changes,
      });
    }

    return NextResponse.json({ success: true, data: room, message: 'Room saved' });
  } catch (error: any) {
    console.error('Error updating room:', error);
    if (error?.code === 11000) {
      return NextResponse.json({ success: false, error: `There is already a room called ${String($set.name)}.` }, { status: 409 });
    }
    if (error?.name === 'ValidationError' || error?.name === 'CastError') {
      return NextResponse.json({ success: false, error: 'Invalid room data' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Failed to save the room' }, { status: 500 });
  }
}

/**
 * DELETE: remove a room added by mistake. A room the queue has ever used is kept (those visits
 * point to it); close it instead.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'rooms', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Room');

    const room = await Room.findOne(tenantFilter(ctx.tenantId, { _id: id }));
    if (!room) return notFound('Room');

    if (await Queue.exists({ tenantId: ctx.tenantObjectId, room: room._id })) {
      return NextResponse.json(
        { success: false, error: `${room.name} has been used for patients, so it’s kept for their records. Mark it closed instead.` },
        { status: 409 }
      );
    }

    await Room.deleteOne({ _id: room._id, tenantId: ctx.tenantObjectId });

    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'delete',
      resource: 'room',
      resourceId: String(room._id),
      description: `Removed the room ${room.name}`,
    });

    return NextResponse.json({ success: true, data: {}, message: 'Room removed' });
  } catch (error) {
    console.error('Error deleting room:', error);
    return NextResponse.json({ success: false, error: 'Failed to remove the room' }, { status: 500 });
  }
}
