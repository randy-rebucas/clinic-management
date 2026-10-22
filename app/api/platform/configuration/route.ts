import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePlatformApi, isPlatformError } from '@/lib/platform-auth';
import { createAuditLog } from '@/lib/audit';
import logger from '@/lib/logger';
import { testPaymongoKey } from '@/lib/paymongo';
import { getBillingIssuer, getPlanPricing, getPlatformFees, lastIssuedSerial, savePlatformSection } from '@/lib/platform-config';
import { loadPlatformConfig } from '@/lib/platform-config-page';
import { billingIssuerSchema, feesSchema, paymongoSectionSchema, pricingSchema } from '@/lib/platform-config-schema';
import { formatSerial } from '@/lib/bir';

/** GET /api/platform/configuration: every section as the console shows it (no secrets). */
export async function GET() {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  return NextResponse.json({ success: true, data: await loadPlatformConfig() });
}

const BodySchema = z.object({
  section: z.enum(['billing-issuer', 'paymongo', 'pricing', 'fees']),
  values: z.unknown(),
});

function fieldError(field: string, message: string) {
  return NextResponse.json({ success: false, error: message, fieldErrors: { [field]: message } }, { status: 400 });
}

function invalid(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[issue.path.join('.') || 'form'] ??= issue.message;
  return NextResponse.json({ success: false, error: 'Check the highlighted fields.', fieldErrors }, { status: 400 });
}

/**
 * PUT /api/platform/configuration  { section, values }
 * Save one section. Every save is in the audit log with what changed (secrets only as "changed").
 */
export async function PUT(request: NextRequest) {
  const admin = await requirePlatformApi();
  if (isPlatformError(admin)) return admin;
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ success: false, error: 'Unknown section' }, { status: 400 });
  const { section, values } = body.data;

  try {
    let before: unknown;
    let after: unknown;

    if (section === 'billing-issuer') {
      const parsed = billingIssuerSchema.safeParse(values);
      if (!parsed.success) return invalid(parsed.error);
      // Serials already issued under this prefix are never reused: the range must leave room past them.
      const last = await lastIssuedSerial(parsed.data.serialPrefix);
      if (last >= parsed.data.serialEnd) {
        return fieldError('serialEnd', `${formatSerial(parsed.data.serialPrefix, last)} is already issued; the range must end after it.`);
      }
      before = await getBillingIssuer();
      after = parsed.data;
      await savePlatformSection(section, parsed.data, admin.email);
    } else if (section === 'pricing') {
      const parsed = pricingSchema.safeParse(values);
      if (!parsed.success) return invalid(parsed.error);
      before = await getPlanPricing();
      after = parsed.data;
      // Orders already started keep the amount they were created with.
      await savePlatformSection(section, parsed.data, admin.email);
      revalidatePath('/pricing');
      revalidatePath('/compare');
    } else if (section === 'fees') {
      const parsed = feesSchema.safeParse(values);
      if (!parsed.success) return invalid(parsed.error);
      before = await getPlatformFees();
      after = parsed.data;
      await savePlatformSection(section, parsed.data, admin.email);
      revalidatePath('/medical-representatives/onboard');
    } else {
      const parsed = paymongoSectionSchema.safeParse(values);
      if (!parsed.success) return invalid(parsed.error);
      const { secretKey, webhookSecret, clear } = parsed.data;
      if (clear) {
        await savePlatformSection(section, {}, admin.email, { unset: ['secretKey', 'webhookSecret'] });
        after = { keys: 'removed; the server’s env values apply' };
      } else {
        if (!secretKey && !webhookSecret) return fieldError('secretKey', 'Enter a key to change.');
        // A key is checked against PayMongo before it replaces the one in use.
        if (secretKey) {
          const test = await testPaymongoKey(secretKey);
          if (!test.ok) return fieldError('secretKey', test.error);
        }
        const set: Record<string, string> = {};
        if (secretKey) set.secretKey = secretKey;
        if (webhookSecret) set.webhookSecret = webhookSecret;
        await savePlatformSection(section, {}, admin.email, { set });
        after = Object.fromEntries(Object.keys(set).map((k) => [k, 'changed']));
      }
    }

    await createAuditLog({
      userEmail: admin.email,
      userRole: 'platform-admin',
      action: 'update',
      resource: 'settings',
      description: `Platform configuration: ${section} saved`,
      metadata: { platform: true, section, before, after },
    });
    return NextResponse.json({ success: true, data: await loadPlatformConfig() });
  } catch (error) {
    logger.error('Error saving platform configuration', error as Error, { section });
    return NextResponse.json({ success: false, error: 'The configuration could not be saved.' }, { status: 500 });
  }
}
