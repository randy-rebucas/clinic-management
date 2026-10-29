import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import PatientNote from '@/models/PatientNote';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, patientTenantFilter, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { Types } from 'mongoose';
import { logPatientChange } from '../../_lib/patient-audit';

/**
 * GET /api/patients/[id]/notes
 * Get all notes for a patient (filtered by visibility)
 *
 * Query params:
 *   - limit: number (default 50)
 *   - skip: number (default 0)
 *   - visibility: 'private' | 'internal' | 'shared' (filter by visibility)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'patients', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;

    if (!isValidId(id)) {
      return NextResponse.json({ success: false, error: 'Invalid patient ID' }, { status: 400 });
    }

    const patient = await Patient.exists(patientTenantFilter(tenantId, { _id: id }));
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }

    const limit = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('limit') ?? '50') || 50, 1), 100);
    const skip = Math.max(parseInt(request.nextUrl.searchParams.get('skip') ?? '0') || 0, 0);
    const visibility = request.nextUrl.searchParams.get('visibility');

    const query: any = tenantFilter(tenantId, { patient: new Types.ObjectId(id) });

    // Private notes are visible to their author only.
    const ownPrivate = { visibility: 'private', 'author.userId': new Types.ObjectId(session.userId) };
    if (visibility === 'private') {
      Object.assign(query, ownPrivate);
    } else if (visibility === 'internal' || visibility === 'shared') {
      query.visibility = visibility;
    } else {
      query.$or = [{ visibility: { $in: ['internal', 'shared'] } }, ownPrivate];
    }

    const [notes, total] = await Promise.all([
      PatientNote.find(query).sort({ createdAt: -1 }).limit(limit).skip(skip).lean(),
      PatientNote.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: notes,
      pagination: {
        total,
        limit,
        skip,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching patient notes:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch notes' }, { status: 500 });
  }
}

const createNoteSchema = z.object({
  content: z.string().trim().min(1, 'Content is required').max(20000),
  visibility: z.enum(['private', 'internal', 'shared']).default('internal'),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  tags: z.array(z.string().trim().max(50)).max(50).default([]),
});

/**
 * POST /api/patients/[id]/notes
 * Create a new note for a patient
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;

    if (!isValidId(id)) {
      return NextResponse.json({ success: false, error: 'Invalid patient ID' }, { status: 400 });
    }

    const parsed = await parseBody(request, createNoteSchema);
    if (isValidationError(parsed)) return parsed;
    const { content, visibility, priority, tags } = parsed.data;

    const patient = await Patient.exists(patientTenantFilter(tenantId, { _id: id }));
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }

    const note = await PatientNote.create({
      patient: new Types.ObjectId(id),
      author: {
        userId: new Types.ObjectId(session.userId),
        name: session.name || session.email,
        role: session.role,
      },
      content,
      visibility,
      priority,
      tags: tags.filter((t) => t.length > 0),
      tenantId: tenantObjectId,
    });

    // The note's text stays on the note; the log says that one was written, and how it's shared.
    // An update of the patient's record: "create" would read as registering the patient.
    await logPatientChange(ctx, request, {
      action: 'update',
      patientId: id,
      description: `Added a${priority === 'high' ? ' high-priority' : ''} ${visibility} note`,
      metadata: { noteId: String(note._id) },
    });

    return NextResponse.json(
      {
        success: true,
        data: note,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating patient note:', error);
    return NextResponse.json({ success: false, error: 'Failed to create note' }, { status: 500 });
  }
}
