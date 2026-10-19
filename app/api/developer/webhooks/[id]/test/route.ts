import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import WebhookEndpoint from '@/models/WebhookEndpoint';
import { isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { requireDeveloperAdmin } from '@/lib/api/developer-session';
import { sendTestEvent } from '@/lib/webhooks';

/** POST /api/developer/webhooks/:id/test — send a `ping` event now and report the response. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireDeveloperAdmin('webhooks');
  if (isTenantSessionError(ctx)) return ctx;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Webhook endpoint');

  await connectDB();
  const endpoint = await WebhookEndpoint.findOne({ _id: id, tenantId: ctx.tenantObjectId }).select('enabled').lean<any>();
  if (!endpoint) return notFound('Webhook endpoint');
  if (!endpoint.enabled) return NextResponse.json({ success: false, error: 'Switch the endpoint on first.' }, { status: 409 });

  const result = await sendTestEvent(ctx.tenantId, id);
  return NextResponse.json({ success: true, data: { status: result?.status, responseStatus: result?.responseStatus ?? null, error: result?.error ?? null } });
}
