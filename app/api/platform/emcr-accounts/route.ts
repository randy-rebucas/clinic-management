import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import EmcrAccount from '@/models/EmcrAccount';
import Patient from '@/models/Patient';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { createAuditLog } from '@/lib/audit';
import { normalizePhone } from '@/lib/phone';
import { activationView, forgetActivationCache, grantActivationManually } from '@/lib/emcr/activation';

/**
 * GET /api/platform/emcr-accounts?phone=09171234567
 * Look up an eMCR account by its phone number (support: "my code didn't work").
 */
export async function GET(request: NextRequest) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const phone = normalizePhone(request.nextUrl.searchParams.get('phone') ?? '');
  if (!phone) return NextResponse.json({ success: false, error: 'Enter a mobile number.' }, { status: 400 });

  await connectDB();
  const account = await EmcrAccount.findOne({ phone }).lean<any>();
  if (!account) return NextResponse.json({ success: true, data: null });
  const self = account.selfPatientId
    ? await Patient.findById(account.selfPatientId).select('firstName lastName').lean<{ firstName?: string; lastName?: string } | null>()
    : null;
  return NextResponse.json({
    success: true,
    data: {
      id: String(account._id),
      phone: account.phone,
      holder: self ? `${self.firstName ?? ''} ${self.lastName ?? ''}`.trim() : null,
      dependents: account.dependents?.length ?? 0,
      activation: activationView(account),
      history: (account.activationHistory ?? []).map((h: any) => ({
        source: h.source,
        plan: h.plan,
        days: h.days,
        at: h.at,
        expiresAt: h.expiresAt,
        by: h.by ?? null,
        ref: h.source === 'manual' ? h.ref ?? null : null,
      })),
      createdAt: account.createdAt,
    },
  });
}

const GrantSchema = z
  .object({
    accountId: z.string().refine((v) => Types.ObjectId.isValid(v)),
    days: z.number().int().min(1).max(3 * 366),
    plan: z.enum(['basic', 'plus']).default('basic'),
    reason: z.string().trim().min(3).max(300),
  })
  .strict();

/**
 * POST /api/platform/emcr-accounts
 * Body: { accountId, days, plan?, reason }
 * Grant eMCR days by hand (a voucher paid for but lost, a complaint). Audited.
 */
export async function POST(request: NextRequest) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const parsed = await parseBody(request, GrantSchema);
  if (isValidationError(parsed)) return parsed;
  const body = parsed.data;

  const updated = await grantActivationManually(new Types.ObjectId(body.accountId), {
    days: body.days,
    plan: body.plan,
    by: admin.email,
    ref: body.reason,
  });
  if (!updated) return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
  forgetActivationCache();
  await createAuditLog({
    userEmail: admin.email,
    userRole: 'platform-admin',
    action: 'update',
    resource: 'settings',
    description: `eMCR: ${body.days} days granted by hand to account ${body.accountId}: ${body.reason}`,
    metadata: { platform: true, emcrAccount: body.accountId },
  });
  return NextResponse.json({ success: true, data: { activation: activationView(updated) } });
}
