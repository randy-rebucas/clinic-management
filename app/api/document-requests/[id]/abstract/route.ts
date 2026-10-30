import { NextRequest, NextResponse, after } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import DocumentRequest from '@/models/DocumentRequest';
import '@/models/User';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { createAuditLog } from '@/lib/audit';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { ABSTRACT_LABELS, ABSTRACT_REQUIRED, abstractSchema, draftAbstractFromChart, missingAbstractFields } from '@/lib/clinical-abstract';
import logger from '@/lib/logger';

type Params = { params: Promise<{ id: string }> };

async function findAbstractRequest(id: string, tenantObjectId: Types.ObjectId) {
  if (!isValidId(id)) return null;
  return DocumentRequest.findOne({ _id: id, tenantId: tenantObjectId, kind: 'clinical_abstract' })
    .populate({ path: 'abstractAuthor', select: 'name' })
    .lean<any>();
}

/**
 * GET /api/document-requests/[id]/abstract  (visits → read)
 * The clinical abstract for this request: what was saved, or (`fromChart: true`) a draft built
 * from the patient's chart to start from. → { abstract, fromChart, savedAt, author, missing, labels, required }
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const denied = await requirePermission(ctx.session, 'visits', 'read');
  if (denied) return denied;

  try {
    await connectDB();
    const found = await findAbstractRequest((await params).id, ctx.tenantObjectId);
    if (!found) return notFound('Request');

    const saved = !!found.abstractSavedAt;
    const abstract = saved ? found.abstract ?? {} : await draftAbstractFromChart(found, await getTenantTimezone(ctx.tenantId));
    return NextResponse.json({
      success: true,
      data: {
        abstract,
        fromChart: !saved,
        savedAt: found.abstractSavedAt ?? null,
        author: found.abstractAuthor?.name ?? null,
        missing: missingAbstractFields(abstract),
        labels: ABSTRACT_LABELS,
        required: ABSTRACT_REQUIRED,
      },
    });
  } catch (error) {
    logger.error('Error loading clinical abstract', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to load the abstract' }, { status: 500 });
  }
}

/**
 * PUT /api/document-requests/[id]/abstract  (visits → write)
 * Body: the abstract's sections (each optional, max 4000 characters). Saves it while the request
 * is pending; whoever saves becomes its author and signs it. 409 once released or closed.
 * → { savedAt, missing }
 */
export async function PUT(request: NextRequest, { params }: Params) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const denied = await requirePermission(ctx.session, 'visits', 'write');
  if (denied) return denied;

  const parsed = await parseBody(request, abstractSchema);
  if (isValidationError(parsed)) return parsed;

  try {
    await connectDB();
    const { id } = await params;
    const found = await findAbstractRequest(id, ctx.tenantObjectId);
    if (!found) return notFound('Request');

    const abstract = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v));
    const savedAt = new Date();
    const updated = await DocumentRequest.updateOne(
      { _id: found._id, tenantId: ctx.tenantObjectId, status: 'pending' },
      { $set: { abstract, abstractAuthor: new Types.ObjectId(ctx.session.userId), abstractSavedAt: savedAt } }
    );
    if (!updated.modifiedCount) {
      return NextResponse.json({ success: false, error: 'This request was already answered, so its abstract can’t change.' }, { status: 409 });
    }

    after(() =>
      createAuditLog({
        userId: ctx.session.userId,
        userEmail: ctx.session.email,
        userRole: ctx.session.role,
        tenantId: ctx.tenantId,
        action: 'update',
        resource: 'patient',
        resourceId: String(found.patient),
        dataSubject: String(found.patient),
        requestMethod: 'PUT',
        requestPath: request.nextUrl.pathname,
        description: `${found.abstractSavedAt ? 'Edited' : 'Wrote'} clinical abstract ${found.requestCode}`,
        metadata: { documentRequestId: String(found._id) },
      })
    );

    return NextResponse.json({ success: true, data: { savedAt, missing: missingAbstractFields(abstract) } });
  } catch (error) {
    logger.error('Error saving clinical abstract', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to save the abstract' }, { status: 500 });
  }
}
