import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ClinicalTemplate from '@/models/ClinicalTemplate';
import { requireTenantSession, isTenantSessionError, isValidId } from '@/lib/api/tenant-session';

/**
 * POST /api/clinical-templates/:id/use — count a use, so favourites rise to the top.
 * Any template the caller can see (own or shared). Starter templates are not counted.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId } = ctx;

  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ success: true });

  await connectDB();
  await ClinicalTemplate.updateOne(
    { _id: id, tenantId: tenantObjectId, $or: [{ ownerId: session.userId }, { shared: true }] },
    { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } }
  );
  return NextResponse.json({ success: true });
}
