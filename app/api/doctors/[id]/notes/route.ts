import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import { requirePermission } from '@/app/lib/auth-helpers';
import {
  requireTenantSession,
  isTenantSessionError,
  tenantFilter,
  isValidId,
  notFound,
} from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';

const noteSchema = z.object({
  note: z.string().trim().min(1).max(5000),
  isImportant: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'doctors', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Doctor');

    const parsed = await parseBody(request, noteSchema);
    if (isValidationError(parsed)) return parsed;

    const note = {
      note: parsed.data.note,
      createdBy: session.userId,
      createdAt: new Date(),
      isImportant: parsed.data.isImportant || false,
    };

    const doctor = await Doctor.findOneAndUpdate(
      tenantFilter(tenantId, { _id: id }),
      { $push: { internalNotes: note } },
      { new: true }
    ).populate('specializationId', 'name description category');

    if (!doctor) {
      return notFound('Doctor');
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
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'doctors', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Doctor');

    const noteIndex = request.nextUrl.searchParams.get('index');
    if (noteIndex === null) {
      return NextResponse.json(
        { success: false, error: 'Note index required' },
        { status: 400 }
      );
    }
    const index = Number(noteIndex);
    if (!Number.isInteger(index) || index < 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid note index' },
        { status: 400 }
      );
    }

    const doctor = await Doctor.findOne(tenantFilter(tenantId, { _id: id }));
    if (!doctor) {
      return notFound('Doctor');
    }

    if (doctor.internalNotes && doctor.internalNotes.length > index) {
      doctor.internalNotes.splice(index, 1);
      await doctor.save();
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
