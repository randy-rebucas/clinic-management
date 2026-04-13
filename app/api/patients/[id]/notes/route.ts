import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import PatientNote from '@/models/PatientNote';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

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
  const session = await verifySession() as any;
  if (!session) return unauthorizedResponse();

  const permissionCheck = await requirePermission(session, 'patients', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid patient ID' }, { status: 400 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Verify patient exists and belongs to tenant
    const patient = await Patient.findById(id).lean();
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '50'), 100);
    const skip = parseInt(request.nextUrl.searchParams.get('skip') ?? '0');
    const visibility = request.nextUrl.searchParams.get('visibility');

    const query: any = {
      patient: new Types.ObjectId(id),
    };

    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    }

    // Filter by visibility if requested
    if (visibility && ['private', 'internal', 'shared'].includes(visibility)) {
      query.visibility = visibility;
    } else {
      // Default: show internal and shared for staff, only shared for patients
      if (session.user?.role?.name === 'patient') {
        query.visibility = 'shared';
      } else {
        query.visibility = { $in: ['internal', 'shared'] };
      }
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

/**
 * POST /api/patients/[id]/notes
 * Create a new note for a patient
 *
 * Request body:
 * {
 *   content: string,
 *   visibility?: 'private' | 'internal' | 'shared',
 *   priority?: 'low' | 'normal' | 'high',
 *   tags?: string[]
 * }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid patient ID' }, { status: 400 });
    }

    const body = await request.json();
    const { content, visibility = 'internal', priority = 'normal', tags = [] } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Content is required' }, { status: 400 });
    }

    // Verify patient exists
    const patient = await Patient.findById(id).lean();
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const note = await PatientNote.create({
      patient: new Types.ObjectId(id),
      author: {
        userId: new Types.ObjectId(session.userId),
        name: session.name || session.email,
        role: session.role,
      },
      content: content.trim(),
      visibility,
      priority,
      tags: tags.filter((t: string) => typeof t === 'string' && t.trim().length > 0),
      tenantId: tenantId ? new Types.ObjectId(tenantId) : undefined,
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
