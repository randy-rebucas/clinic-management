import { NextRequest, NextResponse } from 'next/server';
import Tenant from '@/models/Tenant';
import ApiKey from '@/models/ApiKey';
import { requireApiKey, isApiError } from '@/lib/api-keys';

/** GET /api/v1/me — the clinic and scopes this key belongs to. Any valid key may call it. */
export async function GET(request: NextRequest) {
  const ctx = await requireApiKey(request, null);
  if (isApiError(ctx)) return ctx;

  const [tenant, key] = await Promise.all([
    Tenant.findById(ctx.tenantId).select('name displayName subdomain settings.timezone').lean<any>(),
    ApiKey.findById(ctx.apiKeyId).select('name').lean<any>(),
  ]);
  return NextResponse.json({
    clinic: {
      id: ctx.tenantId,
      name: tenant?.displayName || tenant?.name,
      subdomain: tenant?.subdomain,
      timezone: tenant?.settings?.timezone ?? 'UTC',
    },
    key: { id: ctx.keyId, name: key?.name, scopes: ctx.scopes },
  });
}
