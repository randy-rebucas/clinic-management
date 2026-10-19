import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import Role from '@/models/Role';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { requirePlatformApi, isPlatformError, issueViewAsHandoff } from '@/lib/platform-auth';

const BodySchema = z.object({
  /** The clinic admin to view as. Defaults to the clinic's longest-standing active admin. */
  userId: zObjectId.optional(),
});

/**
 * POST /api/platform/tenants/:id/view-as
 * Returns the clinic-subdomain URL that opens a 30-minute read-only session as one of the
 * clinic's admins. The URL carries a one-minute, single-use hand-off token.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Clinic');

  const parsed = await parseBody(request, BodySchema);
  if (isValidationError(parsed)) return parsed;

  await connectDB();
  const tenant = await Tenant.findById(id).select('subdomain status').lean<any>();
  if (!tenant) return notFound('Clinic');
  if (tenant.status !== 'active') {
    return NextResponse.json({ success: false, error: 'Reactivate the clinic before viewing it.' }, { status: 409 });
  }

  const tenantId = new Types.ObjectId(id);
  const adminRoles = await Role.find({ tenantId, name: { $in: ['admin', 'owner'] } }).select('_id').lean<{ _id: Types.ObjectId }[]>();
  const userFilter: Record<string, unknown> = { tenantId, status: 'active', role: { $in: adminRoles.map((r) => r._id) } };
  if (parsed.data.userId) userFilter._id = parsed.data.userId;
  const user = await User.findOne(userFilter).sort({ createdAt: 1 }).select('_id').lean<{ _id: Types.ObjectId } | null>();
  if (!user) {
    return NextResponse.json({ success: false, error: 'This clinic has no active admin to view as.' }, { status: 409 });
  }

  const token = await issueViewAsHandoff({ tenantId: id, userId: String(user._id), platformEmail: admin.email });
  const here = new URL(request.url);
  const url = new URL(`/api/platform/view-as`, `${here.protocol}//${tenant.subdomain}.${here.host}`);
  url.searchParams.set('t', token);
  return NextResponse.json({ success: true, data: { url: url.toString() } });
}
