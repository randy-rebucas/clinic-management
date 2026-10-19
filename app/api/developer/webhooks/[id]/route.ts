import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import WebhookEndpoint, { WEBHOOK_EVENTS } from '@/models/WebhookEndpoint';
import WebhookDelivery from '@/models/WebhookDelivery';
import { isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { requireDeveloperAdmin } from '@/lib/api/developer-session';
import { checkWebhookUrl, encryptSecret, generateWebhookSecret } from '@/lib/webhooks';
import { createAuditLog } from '@/lib/audit';

const PatchSchema = z.object({
  url: z.string().trim().max(2048).optional(),
  description: z.string().trim().max(200).optional(),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).optional(),
  enabled: z.boolean().optional(),
  /** Issue a new signing secret; the old one stops working at once. */
  rotateSecret: z.literal(true).optional(),
});

/** PATCH /api/developer/webhooks/:id — edit, switch on/off, or rotate the secret. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = await parseBody(request, PatchSchema);
  if (isValidationError(parsed)) return parsed;
  const b = parsed.data;
  // Turning an endpoint off works on any plan; anything else needs webhooks on the plan.
  const ctx = await requireDeveloperAdmin(b.enabled === false && Object.keys(b).length === 1 ? undefined : 'webhooks');
  if (isTenantSessionError(ctx)) return ctx;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Webhook endpoint');

  if (b.url) {
    const urlError = await checkWebhookUrl(b.url);
    if (urlError) return NextResponse.json({ success: false, error: urlError }, { status: 400 });
  }

  const set: Record<string, unknown> = {};
  if (b.url) set.url = b.url;
  if (b.description !== undefined) set.description = b.description;
  if (b.events) set.events = [...new Set(b.events)];
  if (b.enabled !== undefined) {
    set.enabled = b.enabled;
    if (b.enabled) {
      set.consecutiveFailures = 0;
      set.disabledReason = null;
    }
  }
  let secret: string | undefined;
  if (b.rotateSecret) {
    secret = generateWebhookSecret();
    set.secretEnc = encryptSecret(secret);
  }

  await connectDB();
  const updated = await WebhookEndpoint.findOneAndUpdate({ _id: id, tenantId: ctx.tenantObjectId }, { $set: set }, { new: true, projection: { url: 1 } }).lean<any>();
  if (!updated) return notFound('Webhook endpoint');

  await createAuditLog({
    userId: ctx.session.userId,
    userEmail: ctx.session.email,
    userRole: ctx.session.role,
    tenantId: ctx.tenantId,
    action: 'update',
    resource: 'settings',
    resourceId: id,
    description: `Changed webhook endpoint ${updated.url}: ${Object.keys(set).filter((k) => k !== 'secretEnc').concat(secret ? ['new signing secret'] : []).join(', ')}`,
  });
  return NextResponse.json({ success: true, data: { ...(secret ? { secret } : {}) } });
}

/** DELETE /api/developer/webhooks/:id — remove the endpoint; pending deliveries are dropped. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireDeveloperAdmin();
  if (isTenantSessionError(ctx)) return ctx;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Webhook endpoint');

  await connectDB();
  const removed = await WebhookEndpoint.findOneAndDelete({ _id: id, tenantId: ctx.tenantObjectId }).select('url').lean<any>();
  if (!removed) return notFound('Webhook endpoint');
  await WebhookDelivery.updateMany({ endpointId: removed._id, status: 'pending' }, { $set: { status: 'failed', error: 'Endpoint removed', nextAttemptAt: null } });

  await createAuditLog({
    userId: ctx.session.userId,
    userEmail: ctx.session.email,
    userRole: ctx.session.role,
    tenantId: ctx.tenantId,
    action: 'delete',
    resource: 'settings',
    resourceId: id,
    description: `Removed webhook endpoint ${removed.url}`,
  });
  return NextResponse.json({ success: true, data: { removed: true } });
}
