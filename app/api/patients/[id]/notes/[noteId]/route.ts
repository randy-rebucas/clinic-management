import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import PatientNote from '@/models/PatientNote';
import { requirePermission, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { Types } from 'mongoose';
import { logPatientChange } from '../../../_lib/patient-audit';

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
      return refuseAccess(session, 'You do not have permission to edit this note', 'patients', 'update');
    }

    const body = await request.json().catch(() => ({}));
    const { content, visibility, priority, tags } = body ?? {};
    const was = { content: note.content, visibility: note.visibility, priority: note.priority, tags: [...(note.tags ?? [])] };

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

    // The text itself stays on the note; the log records that it changed.
    const changes = [
      was.content !== note.content ? { field: 'content', oldValue: 'Not copied to the log', newValue: 'Not copied to the log' } : null,
      was.visibility !== note.visibility ? { field: 'visibility', oldValue: was.visibility, newValue: note.visibility } : null,
      was.priority !== note.priority ? { field: 'priority', oldValue: was.priority, newValue: note.priority } : null,
      was.tags.join(', ') !== (note.tags ?? []).join(', ') ? { field: 'tags', oldValue: was.tags.join(', ') || null, newValue: (note.tags ?? []).join(', ') || null } : null,
    ].filter((c) => c !== null);
    if (changes.length) {
      await logPatientChange(ctx, request, {
        action: 'update',
        patientId: id,
        description: `Edited a note${note.author.userId.toString() !== session.userId ? ` written by ${note.author.name || 'a colleague'}` : ''}`,
        changes,
        metadata: { noteId },
      });
    }

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
      return refuseAccess(session, 'You do not have permission to delete this note', 'patients', 'delete');
    }

    await PatientNote.deleteOne(query);

    // An update of the patient's record: "delete" would read as removing the patient.
    await logPatientChange(ctx, request, {
      action: 'update',
      patientId: id,
      description: `Deleted a ${note.visibility} note${note.author.userId.toString() !== session.userId ? ` written by ${note.author.name || 'a colleague'}` : ''}`,
      metadata: { noteId },
    });

    return NextResponse.json({
      success: true,
      message: 'Note deleted',
    });
  } catch (error) {
    console.error('Error deleting patient note:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete note' }, { status: 500 });
  }
}
