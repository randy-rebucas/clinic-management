import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import ApiKey, { API_SCOPES } from '@/models/ApiKey';
import { isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { requireDeveloperAdmin } from '@/lib/api/developer-session';
import { generateApiKey } from '@/lib/api-keys';
import { createAuditLog } from '@/lib/audit';

const MAX_ACTIVE_KEYS = 20;

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(API_SCOPES)).min(1).max(API_SCOPES.length),
});

/** POST /api/developer/api-keys — create a key. The full key is in this response only. */
export async function POST(request: NextRequest) {
  const ctx = await requireDeveloperAdmin('apiAccess');
  if (isTenantSessionError(ctx)) return ctx;
  const parsed = await parseBody(request, CreateSchema);
  if (isValidationError(parsed)) return parsed;

  await connectDB();
  const active = await ApiKey.countDocuments({ tenantId: ctx.tenantObjectId, revokedAt: null });
  if (active >= MAX_ACTIVE_KEYS) {
    return NextResponse.json({ success: false, error: `A clinic can have ${MAX_ACTIVE_KEYS} active keys. Revoke one first.` }, { status: 409 });
  }

  const { key, keyId, secretHash, preview } = generateApiKey();
  const doc = await ApiKey.create({
    tenantId: ctx.tenantObjectId,
    name: parsed.data.name,
    keyId,
    secretHash,
    preview,
    scopes: [...new Set(parsed.data.scopes)],
    createdBy: ctx.session.userId,
    createdByEmail: ctx.session.email,
  });

  await createAuditLog({
    userId: ctx.session.userId,
    userEmail: ctx.session.email,
    userRole: ctx.session.role,
    tenantId: ctx.tenantId,
    action: 'create',
    resource: 'settings',
    resourceId: String(doc._id),
    description: `Created API key "${parsed.data.name}" (${preview}) with ${doc.scopes.join(', ')}`,
  });

  return NextResponse.json({ success: true, data: { id: String(doc._id), key, preview, name: doc.name, scopes: doc.scopes } }, { status: 201 });
}
