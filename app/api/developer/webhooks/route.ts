import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import WebhookEndpoint, { WEBHOOK_EVENTS } from '@/models/WebhookEndpoint';
import { isTenantSessionError } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { requireDeveloperAdmin } from '@/lib/api/developer-session';
import { checkWebhookUrl, encryptSecret, generateWebhookSecret } from '@/lib/webhooks';
import { createAuditLog } from '@/lib/audit';

const MAX_ENDPOINTS = 10;

const EndpointSchema = z.object({
  url: z.string().trim().max(2048),
  description: z.string().trim().max(200).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

/** POST /api/developer/webhooks — add an endpoint. The signing secret is in this response only. */
export async function POST(request: NextRequest) {
  const ctx = await requireDeveloperAdmin('webhooks');
  if (isTenantSessionError(ctx)) return ctx;
  const parsed = await parseBody(request, EndpointSchema);
  if (isValidationError(parsed)) return parsed;

  const urlError = await checkWebhookUrl(parsed.data.url);
  if (urlError) return NextResponse.json({ success: false, error: urlError }, { status: 400 });

  await connectDB();
  if ((await WebhookEndpoint.countDocuments({ tenantId: ctx.tenantObjectId })) >= MAX_ENDPOINTS) {
    return NextResponse.json({ success: false, error: `A clinic can have ${MAX_ENDPOINTS} webhook endpoints.` }, { status: 409 });
  }

  const secret = generateWebhookSecret();
  const doc = await WebhookEndpoint.create({
    tenantId: ctx.tenantObjectId,
    url: parsed.data.url,
    description: parsed.data.description,
    events: [...new Set(parsed.data.events)],
    secretEnc: encryptSecret(secret),
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
    description: `Added webhook endpoint ${parsed.data.url} for ${doc.events.join(', ')}`,
  });

  return NextResponse.json({ success: true, data: { id: String(doc._id), secret } }, { status: 201 });
}
