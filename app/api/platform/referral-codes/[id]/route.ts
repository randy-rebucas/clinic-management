import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { createAuditLog } from '@/lib/audit';
import { setReferralCodeStatus } from '@/lib/rep-referral';

const PatchSchema = z.object({ status: z.enum(['active', 'disabled']) }).strict();

/** PATCH /api/platform/referral-codes/[id]  { status }: turn a code off or back on. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  const parsed = await parseBody(request, PatchSchema);
  if (isValidationError(parsed)) return parsed;

  const doc = await setReferralCodeStatus(id, parsed.data.status);
  if (!doc) {
    return NextResponse.json(
      { success: false, error: 'Couldn’t change it: the code is gone, or the rep already has a newer personal code.' },
      { status: 409 }
    );
  }
  await createAuditLog({
    userEmail: admin.email,
    userRole: 'platform-admin',
    action: 'update',
    resource: 'settings',
    resourceId: doc._id,
    description: `Rep referral code ${doc.code} ${parsed.data.status === 'disabled' ? 'turned off' : 'turned on'}`,
    metadata: { platform: true, repReferralCode: id },
  }).catch(() => undefined);
  return NextResponse.json({ success: true, data: { id, status: doc.status } });
}
