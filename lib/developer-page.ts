import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import ApiKey, { type ApiScope } from '@/models/ApiKey';
import WebhookEndpoint, { type WebhookEvent } from '@/models/WebhookEndpoint';
import WebhookDelivery from '@/models/WebhookDelivery';
import { tenantHasApiAccess } from '@/lib/api-keys';

export interface DeveloperPageData {
  plan: { apiAccess: boolean; webhooks: boolean };
  apiBase: string;
  keys: Array<{ id: string; name: string; preview: string; scopes: ApiScope[]; createdAt: string; createdByEmail: string | null; lastUsedAt: string | null; revokedAt: string | null }>;
  endpoints: Array<{ id: string; url: string; description: string | null; events: WebhookEvent[]; enabled: boolean; disabledReason: string | null; consecutiveFailures: number; createdAt: string }>;
  deliveries: Array<{ id: string; endpointId: string; event: string; status: 'pending' | 'succeeded' | 'failed'; attempts: number; responseStatus: number | null; error: string | null; createdAt: string; lastAttemptAt: string | null; nextAttemptAt: string | null }>;
}

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);

export async function loadDeveloperPage(tenantId: string, origin: string): Promise<DeveloperPageData> {
  await connectDB();
  const tid = new Types.ObjectId(tenantId);
  const [apiAccess, webhooks, keys, endpoints, deliveries] = await Promise.all([
    tenantHasApiAccess(tid, 'apiAccess'),
    tenantHasApiAccess(tid, 'webhooks'),
    ApiKey.find({ tenantId: tid }).sort({ revokedAt: 1, createdAt: -1 }).limit(100).lean<any[]>(),
    WebhookEndpoint.find({ tenantId: tid }).sort({ createdAt: 1 }).lean<any[]>(),
    WebhookDelivery.find({ tenantId: tid }).select('-body').sort({ createdAt: -1 }).limit(50).lean<any[]>(),
  ]);
  return {
    plan: { apiAccess, webhooks },
    apiBase: `${origin}/api/v1`,
    keys: keys.map((k) => ({
      id: String(k._id),
      name: k.name,
      preview: k.preview,
      scopes: k.scopes,
      createdAt: iso(k.createdAt)!,
      createdByEmail: k.createdByEmail ?? null,
      lastUsedAt: iso(k.lastUsedAt),
      revokedAt: iso(k.revokedAt),
    })),
    endpoints: endpoints.map((e) => ({
      id: String(e._id),
      url: e.url,
      description: e.description ?? null,
      events: e.events,
      enabled: e.enabled,
      disabledReason: e.disabledReason ?? null,
      consecutiveFailures: e.consecutiveFailures ?? 0,
      createdAt: iso(e.createdAt)!,
    })),
    deliveries: deliveries.map((d) => ({
      id: String(d._id),
      endpointId: String(d.endpointId),
      event: d.event,
      status: d.status,
      attempts: d.attempts ?? 0,
      responseStatus: d.responseStatus ?? null,
      error: d.error ?? null,
      createdAt: iso(d.createdAt)!,
      lastAttemptAt: iso(d.lastAttemptAt),
      nextAttemptAt: d.status === 'pending' ? iso(d.nextAttemptAt) : null,
    })),
  };
}
