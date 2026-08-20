import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getPatientById } from '@/lib/data/patient';
import { listPatientNotes, createPatientNote } from '@/lib/data/patient-note';

async function resolveTenantId(session: { tenantId?: string | null }) {
  const tenantContext = await getTenantContext();
  return session.tenantId || tenantContext.tenantId;
}

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

/**
 * GET /api/patients/[id]/notes
 * Get all notes for a patient (filtered by visibility)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession() as any;
  if (!session) return unauthorizedResponse();

  const permissionCheck = await requirePermission(session, 'patients', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    const { id } = await params;
    const tenantId = await resolveTenantId(session);

    // Verify patient exists and belongs to tenant (Patient is junction-scoped;
    // run() will correctly return null if the patient isn't in this tenant).
    const patient = await run(tenantId, () => getPatientById(id, { withRelations: false }));
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '50'), 100);
    const skip = parseInt(request.nextUrl.searchParams.get('skip') ?? '0');
    const visibilityParam = request.nextUrl.searchParams.get('visibility');

    let visibility: 'private' | 'internal' | 'shared' | Array<'private' | 'internal' | 'shared'>;
    if (visibilityParam && ['private', 'internal', 'shared'].includes(visibilityParam)) {
      visibility = visibilityParam as 'private' | 'internal' | 'shared';
    } else if (session.user?.role?.name === 'patient') {
      visibility = 'shared';
    } else {
      visibility = ['internal', 'shared'];
    }

    // PatientNote is directly tenant-scoped, so this must run in the same
    // tenant branch as the patient lookup above.
    const { notes, total } = await run(tenantId, () =>
      listPatientNotes(id, { visibility, limit, skip })
    );

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
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    const { id } = await params;
    const body = await request.json();
    const { content, visibility = 'internal', priority = 'normal', tags = [] } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Content is required' }, { status: 400 });
    }

    const tenantId = await resolveTenantId(session);

    const patient = await run(tenantId, () => getPatientById(id, { withRelations: false }));
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }

    const note = await run(tenantId, () =>
      createPatientNote({
        patientId: id,
        authorUserId: session.userId,
        authorName: (session as any).name || session.email,
        authorRole: session.role,
        content: content.trim(),
        visibility,
        priority,
        tags: Array.isArray(tags) ? tags.filter((t: string) => typeof t === 'string' && t.trim().length > 0) : [],
        tenantId: tenantId ?? undefined,
      })
    );

    return NextResponse.json({ success: true, data: note }, { status: 201 });
  } catch (error) {
    console.error('Error creating patient note:', error);
    return NextResponse.json({ success: false, error: 'Failed to create note' }, { status: 500 });
  }
}
