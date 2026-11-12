import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody, isValidationError, zObjectId, zIsoDate } from '@/lib/api/validate';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { createAuditLog } from '@/lib/audit';
import { createPlatformCode, listReferralCodes } from '@/lib/rep-referral';

/** GET /api/platform/referral-codes: every rep referral code, newest first (platform admins). */
export async function GET() {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  return NextResponse.json({ success: true, data: await listReferralCodes() });
}

const CreateSchema = z
  .object({
    repId: zObjectId,
    /** Blank: a random REP-XXXXXX code. */
    code: z.string().trim().max(24).optional(),
    label: z.string().trim().max(120).optional(),
    maxUses: z.number().int().min(1).max(100000).optional(),
    /** Last day the code works (Philippine time). */
    expiresOn: zIsoDate.optional(),
  })
  .strict();

/** POST /api/platform/referral-codes: a custom code (and signup link) for a rep. */
export async function POST(request: NextRequest) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const parsed = await parseBody(request, CreateSchema);
  if (isValidationError(parsed)) return parsed;
  const body = parsed.data;

  // End of the chosen day in Manila (UTC+8).
  const expiresAt = body.expiresOn ? new Date(`${body.expiresOn}T23:59:59.999+08:00`) : undefined;
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ success: false, error: 'Choose an end date in the future.' }, { status: 400 });
  }
  const r = await createPlatformCode({
    repId: body.repId,
    code: body.code || undefined,
    label: body.label || undefined,
    maxUses: body.maxUses,
    expiresAt,
    createdBy: admin.email,
  });
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: r.status });

  await createAuditLog({
    userEmail: admin.email,
    userRole: 'platform-admin',
    action: 'create',
    resource: 'settings',
    resourceId: r.id,
    description: `Rep referral code ${r.code}${body.label ? ` (${body.label})` : ''}`,
    metadata: { platform: true, repReferralCode: r.id, repId: body.repId },
  }).catch(() => undefined);
  return NextResponse.json({ success: true, data: r }, { status: 201 });
}
