import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ClinicalTemplate from '@/models/ClinicalTemplate';
import '@/models/User';
import { isAdmin, requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, type TenantSession } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { duplicateShortcut, ownerIdOf, toDTO, updateTemplateSchema } from '../_lib/shared';

type Params = { params: Promise<{ id: string }> };

/** The owner may edit their template; an administrator may also edit shared ones. */
function editableFilter(id: string, tenantId: unknown, userId: string, admin: boolean) {
  return {
    _id: id,
    tenantId,
    ...(admin ? { $or: [{ ownerId: userId }, { shared: true }] } : { ownerId: userId }),
  };
}

/**
 * A change to your own template is your business; an administrator changing or removing a
 * colleague's shared template is recorded, so the owner can see who did it.
 */
async function auditOthers(
  ctx: TenantSession,
  doc: { _id: unknown; name: string; kind: string; ownerId: unknown },
  action: 'update' | 'delete',
  changed: string[] = []
) {
  const ownerId = ownerIdOf(doc as Parameters<typeof ownerIdOf>[0]);
  if (ownerId === ctx.session.userId) return;
  const owner = (doc.ownerId as { name?: string })?.name ?? 'a colleague';
  await createAuditLog({
    userId: ctx.session.userId,
    userEmail: ctx.session.email,
    userRole: ctx.session.role,
    tenantId: ctx.tenantId,
    action,
    resource: 'clinical_template',
    resourceId: String(doc._id),
    description:
      action === 'delete'
        ? `Removed “${doc.name}”, a shared ${doc.kind} template by ${owner}`
        : `Changed “${doc.name}”, a shared ${doc.kind} template by ${owner}: ${changed.join(', ') || 'no fields'}`,
    metadata: { ownerId, kind: doc.kind },
  });
}

/** PUT /api/clinical-templates/:id — rename, share, or replace content. */
export async function PUT(request: NextRequest, { params }: Params) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;
  const denied = await requirePermission(session, 'visits', 'write');
  if (denied) return denied;

  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });

  const parsed = await parseBody(request, updateTemplateSchema);
  if (isValidationError(parsed)) return parsed;

  await connectDB();
  const admin = isAdmin(session);
  const doc = await ClinicalTemplate.findOne(editableFilter(id, tenantObjectId, session.userId, admin)).populate('ownerId', 'name');
  if (!doc) return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });

  const input = parsed.data;
  if (input.name !== undefined) doc.name = input.name;
  if (input.specialty !== undefined) doc.specialty = input.specialty || undefined;
  if (input.shared !== undefined) doc.shared = input.shared;
  if (doc.kind === 'phrase') {
    if (input.shortcut !== undefined) doc.shortcut = input.shortcut;
    if (input.text !== undefined) doc.text = input.text;
  }
  if (doc.kind === 'visit' && input.visit) doc.set('visit', input.visit);
  if (doc.kind !== 'phrase' && input.medications) {
    if (doc.kind === 'prescription' && input.medications.length === 0) {
      return NextResponse.json({ success: false, error: 'A saved prescription needs at least one medicine.' }, { status: 400 });
    }
    doc.set('medications', input.medications);
  }

  const changed = doc.modifiedPaths({ includeChildren: false }).filter((p) => !p.includes('.'));
  try {
    await doc.save();
  } catch (error) {
    if (duplicateShortcut(error)) {
      return NextResponse.json({ success: false, error: 'You already have a phrase with this shortcut.', field: 'shortcut' }, { status: 409 });
    }
    console.error('Error updating clinical template:', error);
    return NextResponse.json({ success: false, error: 'Could not save the template.' }, { status: 500 });
  }
  if (changed.length) await auditOthers(ctx, doc, 'update', changed);
  return NextResponse.json({ success: true, data: toDTO(doc.toObject() as any, session.userId, admin) });
}

/** DELETE /api/clinical-templates/:id */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;
  const denied = await requirePermission(session, 'visits', 'write');
  if (denied) return denied;

  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });

  await connectDB();
  const doc = await ClinicalTemplate.findOneAndDelete(editableFilter(id, tenantObjectId, session.userId, isAdmin(session)))
    .populate('ownerId', 'name')
    .lean();
  if (!doc) return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
  await auditOthers(ctx, doc, 'delete');
  return NextResponse.json({ success: true });
}
