import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ApiKey from '@/models/ApiKey';
import { isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { requireDeveloperAdmin } from '@/lib/api/developer-session';
import { createAuditLog } from '@/lib/audit';

/** DELETE /api/developer/api-keys/:id — revoke a key. Requests with it fail at once. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireDeveloperAdmin();
  if (isTenantSessionError(ctx)) return ctx;
  const { id } = await params;
  if (!isValidId(id)) return notFound('API key');

  await connectDB();
  const key = await ApiKey.findOneAndUpdate(
    { _id: id, tenantId: ctx.tenantObjectId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true, projection: { name: 1, preview: 1 } }
  ).lean<any>();
  if (!key) return notFound('API key');

  await createAuditLog({
    userId: ctx.session.userId,
    userEmail: ctx.session.email,
    userRole: ctx.session.role,
    tenantId: ctx.tenantId,
    action: 'delete',
    resource: 'settings',
    resourceId: id,
    description: `Revoked API key "${key.name}" (${key.preview})`,
  });
  return NextResponse.json({ success: true, data: { revoked: true } });
}
