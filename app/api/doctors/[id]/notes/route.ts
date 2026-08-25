import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { findDoctorRawById, addDoctorInternalNote, deleteDoctorInternalNoteByIndex } from '@/lib/data/doctor';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { id } = await params;
    const body = await request.json();

    const doctor = await run(tenantId, async () => {
      const existing = await findDoctorRawById(id);
      if (!existing) return null;
      return addDoctorInternalNote(id, {
        note: body.note,
        createdById: session.userId,
        isImportant: body.isImportant || false,
      });
    });

    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: doctor });
  } catch (error: any) {
    console.error('Error adding note:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to add note' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const noteIndex = searchParams.get('index');

    if (noteIndex === null) {
      return NextResponse.json(
        { success: false, error: 'Note index required' },
        { status: 400 }
      );
    }

    const doctor = await run(tenantId, async () => {
      const existing = await findDoctorRawById(id);
      if (!existing) return null;
      return deleteDoctorInternalNoteByIndex(id, parseInt(noteIndex));
    });

    if (!doctor) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: doctor });
  } catch (error: any) {
    console.error('Error deleting note:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete note' },
      { status: 500 }
    );
  }
}
