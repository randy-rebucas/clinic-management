import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getPatientNote, updatePatientNote, deletePatientNote } from '@/lib/data/patient-note';

async function resolveTenantId(session: { tenantId?: string | null }) {
  const tenantContext = await getTenantContext();
  return session.tenantId || tenantContext.tenantId;
}

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

/**
 * PUT /api/patients/[id]/notes/[noteId]
 * Update a patient note (only author or admin can edit)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    const { id, noteId } = await params;
    const tenantId = await resolveTenantId(session);

    const note = await run(tenantId, () => getPatientNote(noteId, id));
    if (!note) {
      return NextResponse.json({ success: false, error: 'Note not found' }, { status: 404 });
    }

    if (note.author.userId !== session.userId && session.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to edit this note' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { content, visibility, priority, tags } = body;

    const updates: { content?: string; visibility?: any; priority?: any; tags?: string[] } = {};
    if (content && typeof content === 'string') updates.content = content.trim();
    if (visibility && ['private', 'internal', 'shared'].includes(visibility)) updates.visibility = visibility;
    if (priority && ['low', 'normal', 'high'].includes(priority)) updates.priority = priority;
    if (Array.isArray(tags)) {
      updates.tags = tags.filter((t: string) => typeof t === 'string' && t.trim().length > 0);
    }

    const updated = await run(tenantId, () => updatePatientNote(noteId, id, updates));

    return NextResponse.json({ success: true, data: updated });
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
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    const { id, noteId } = await params;
    const tenantId = await resolveTenantId(session);

    const note = await run(tenantId, () => getPatientNote(noteId, id));
    if (!note) {
      return NextResponse.json({ success: false, error: 'Note not found' }, { status: 404 });
    }

    if (note.author.userId !== session.userId && session.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'You do not have permission to delete this note' },
        { status: 403 }
      );
    }

    await run(tenantId, () => deletePatientNote(noteId, id));

    return NextResponse.json({ success: true, message: 'Note deleted' });
  } catch (error) {
    console.error('Error deleting patient note:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete note' }, { status: 500 });
  }
}
