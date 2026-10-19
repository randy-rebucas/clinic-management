import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ClinicalTemplate from '@/models/ClinicalTemplate';
import { isAdmin, requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { duplicateShortcut, toDTO, updateTemplateSchema } from '../_lib/shared';

type Params = { params: Promise<{ id: string }> };

/** The owner may edit their template; an administrator may also edit shared ones. */
function editableFilter(id: string, tenantId: unknown, userId: string, admin: boolean) {
  return {
    _id: id,
    tenantId,
    ...(admin ? { $or: [{ ownerId: userId }, { shared: true }] } : { ownerId: userId }),
  };
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
  const doc = await ClinicalTemplate.findOne(editableFilter(id, tenantObjectId, session.userId, admin));
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

  try {
    await doc.save();
  } catch (error) {
    if (duplicateShortcut(error)) {
      return NextResponse.json({ success: false, error: 'You already have a phrase with this shortcut.', field: 'shortcut' }, { status: 409 });
    }
    console.error('Error updating clinical template:', error);
    return NextResponse.json({ success: false, error: 'Could not save the template.' }, { status: 500 });
  }
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
  const result = await ClinicalTemplate.deleteOne(editableFilter(id, tenantObjectId, session.userId, isAdmin(session)));
  if (!result.deletedCount) return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
