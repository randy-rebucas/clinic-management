import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import PatientNote from '@/models/PatientNote';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { Types } from 'mongoose';

/**
 * PUT /api/patients/[id]/notes/[noteId]
 * Update a patient note (only author or admin can edit)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id, noteId } = await params;

    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(noteId)) {
      return NextResponse.json({ success: false, error: 'Invalid IDs' }, { status: 400 });
    }

    const query = tenantFilter(tenantId, {
      _id: new Types.ObjectId(noteId),
      patient: new Types.ObjectId(id),
    });

    const note = await PatientNote.findOne(query);
    if (!note) {
      return NextResponse.json({ success: false, error: 'Note not found' }, { status: 404 });
    }

    // Only author or admin can edit
    if (note.author.userId.toString() !== session.userId && session.role !== 'admin' && session.role !== 'owner') {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to edit this note' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { content, visibility, priority, tags } = body ?? {};

    if (content && typeof content === 'string' && content.trim()) {
      note.content = content.trim().slice(0, 20000);
    }

    if (visibility && ['private', 'internal', 'shared'].includes(visibility)) {
      note.visibility = visibility;
    }

    if (priority && ['low', 'normal', 'high'].includes(priority)) {
      note.priority = priority;
    }

    if (Array.isArray(tags)) {
      note.tags = tags
        .filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0)
        .slice(0, 50)
        .map((t) => t.trim().slice(0, 50));
    }

    await note.save();

    return NextResponse.json({
      success: true,
      data: note,
    });
  } catch (error) {
    console.error('Error updating patient note:', error);
    return NextResponse.json({ success: false, error: 'Failed to update note' }, { status: 500 });
  }
}

/**
 * DELETE /api/patients/[id]/notes/[noteId]
 * Delete a patient note (only author or admin)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id, noteId } = await params;

    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(noteId)) {
      return NextResponse.json({ success: false, error: 'Invalid IDs' }, { status: 400 });
    }

    const query = tenantFilter(tenantId, {
      _id: new Types.ObjectId(noteId),
      patient: new Types.ObjectId(id),
    });

    const note = await PatientNote.findOne(query);
    if (!note) {
      return NextResponse.json({ success: false, error: 'Note not found' }, { status: 404 });
    }

    // Only author or admin can delete
    if (note.author.userId.toString() !== session.userId && session.role !== 'admin' && session.role !== 'owner') {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to delete this note' },
        { status: 403 }
      );
    }

    await PatientNote.deleteOne(query);

    return NextResponse.json({
      success: true,
      message: 'Note deleted',
    });
  } catch (error) {
    console.error('Error deleting patient note:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete note' }, { status: 500 });
  }
}
