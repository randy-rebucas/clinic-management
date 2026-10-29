import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { createAuditLog } from '@/lib/audit';
import { clearTenantCache } from '@/lib/tenant';

const DAY = 24 * 60 * 60 * 1000;

const PatchSchema = z
  .object({
    /** Suspend locks the clinic out (every staff session ends); active restores it. */
    status: z.enum(['active', 'suspended']).optional(),
    /** Push the current period's end out by this many days (trial extension, goodwill). */
    extendDays: z.number().int().min(1).max(365).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.status !== undefined || b.extendDays !== undefined, { message: 'Nothing to change' });

/** PATCH /api/platform/tenants/:id — platform admin changes to one clinic. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Clinic');

  const parsed = await parseBody(request, PatchSchema);
  if (isValidationError(parsed)) return parsed;
  const { status, extendDays, reason } = parsed.data;

  await connectDB();
  const tenant = await Tenant.findById(id).select('status subscription.expiresAt subscription.status').lean<any>();
  if (!tenant) return notFound('Clinic');

  const set: Record<string, unknown> = {};
  const changes: Array<{ field: string; oldValue?: unknown; newValue?: unknown }> = [];

  if (status && status !== tenant.status) {
    set.status = status;
    changes.push({ field: 'status', oldValue: tenant.status, newValue: status });
  }
  if (extendDays) {
    const current = tenant.subscription?.expiresAt ? new Date(tenant.subscription.expiresAt) : null;
    const from = current && current.getTime() > Date.now() ? current : new Date();
    const next = new Date(from.getTime() + extendDays * DAY);
    set['subscription.expiresAt'] = next;
    if (tenant.subscription?.status === 'expired') set['subscription.status'] = 'active';
    changes.push({ field: 'subscription.expiresAt', oldValue: current?.toISOString() ?? null, newValue: next.toISOString() });
  }

  if (changes.length) {
    await Tenant.updateOne({ _id: id }, { $set: set });
    clearTenantCache();
    if (set.status === 'suspended') {
      // End every session in the clinic; sign-in is refused while the clinic is not active.
      await User.updateMany({ tenantId: new Types.ObjectId(id) }, { $inc: { sessionVersion: 1 } });
    }
    await createAuditLog({
      userEmail: admin.email,
      userRole: 'platform-admin',
      tenantId: id,
      action: 'update',
      resource: 'settings',
      resourceId: id,
      changes,
      description: `Platform admin ${admin.email} changed the clinic account${reason ? `: ${reason}` : ''}`,
      metadata: { platform: true },
    });
  }

  return NextResponse.json({ success: true, data: { changed: changes.map((c) => c.field) } });
}
