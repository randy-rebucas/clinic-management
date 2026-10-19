import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ClinicalTemplate from '@/models/ClinicalTemplate';
import '@/models/User';
import { isAdmin, requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { STARTER_TEMPLATES, type TemplateKind } from '@/lib/clinical-templates';
import { createTemplateSchema, duplicateShortcut, toDTO } from './_lib/shared';

const KINDS: TemplateKind[] = ['visit', 'prescription', 'phrase'];

/**
 * GET /api/clinical-templates?kind=visit|prescription|phrase
 * The caller's own templates plus those shared with the clinic, most used first.
 * Visit listings also include the built-in starter library (starter: true).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;
  const denied = await requirePermission(session, 'visits', 'read');
  if (denied) return denied;

  const kindParam = request.nextUrl.searchParams.get('kind');
  const kind = KINDS.find((k) => k === kindParam);

  await connectDB();
  const rows = await ClinicalTemplate.find({
    tenantId: tenantObjectId,
    $or: [{ ownerId: session.userId }, { shared: true }],
    ...(kind ? { kind } : {}),
  })
    .populate('ownerId', 'name')
    .sort({ usageCount: -1, name: 1 })
    .limit(500)
    .lean();

  const admin = isAdmin(session);
  const data = rows.map((r) => toDTO(r as any, session.userId, admin));
  const withStarters = !kind || kind === 'visit' ? [...data, ...STARTER_TEMPLATES] : data;
  return NextResponse.json({ success: true, data: withStarters });
}

/** POST /api/clinical-templates — create one of the caller's templates. */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;
  const denied = await requirePermission(session, 'visits', 'write');
  if (denied) return denied;

  const parsed = await parseBody(request, createTemplateSchema);
  if (isValidationError(parsed)) return parsed;

  await connectDB();
  const count = await ClinicalTemplate.countDocuments({ tenantId: tenantObjectId, ownerId: session.userId });
  if (count >= 300) {
    return NextResponse.json({ success: false, error: 'You have 300 templates. Delete some before adding more.' }, { status: 409 });
  }

  try {
    const doc = await ClinicalTemplate.create({ ...parsed.data, tenantId: tenantObjectId, ownerId: session.userId });
    return NextResponse.json({ success: true, data: toDTO(doc.toObject() as any, session.userId, isAdmin(session)) }, { status: 201 });
  } catch (error) {
    if (duplicateShortcut(error)) {
      return NextResponse.json({ success: false, error: 'You already have a phrase with this shortcut.', field: 'shortcut' }, { status: 409 });
    }
    console.error('Error creating clinical template:', error);
    return NextResponse.json({ success: false, error: 'Could not save the template.' }, { status: 500 });
  }
}
