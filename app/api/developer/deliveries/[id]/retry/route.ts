import { NextRequest, NextResponse } from 'next/server';
import { isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { requireDeveloperAdmin } from '@/lib/api/developer-session';
import { redeliver } from '@/lib/webhooks';

/** POST /api/developer/deliveries/:id/retry — send a past webhook delivery once more, now. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireDeveloperAdmin('webhooks');
  if (isTenantSessionError(ctx)) return ctx;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Delivery');

  const result = await redeliver(ctx.tenantId, id);
  if (!result) return notFound('Delivery');
  return NextResponse.json({ success: true, data: { status: result.status, responseStatus: result.responseStatus ?? null, error: result.error ?? null } });
}
