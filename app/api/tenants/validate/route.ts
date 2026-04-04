import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';

/**
 * Reason codes returned when a tenant fails validation.
 * The third-party app should use these to show appropriate messages.
 */
type InvalidReason =
  | 'not_found'              // subdomain does not exist
  | 'inactive'               // tenant status is "inactive" or "suspended"
  | 'no_subscription'        // tenant has no subscription record
  | 'subscription_cancelled' // subscription.status === "cancelled"
  | 'subscription_expired'   // expiresAt is in the past
  | 'missing_subdomain';     // request did not provide a subdomain

const REASON_MESSAGES: Record<InvalidReason, string> = {
  not_found:
    'No clinic found with this identifier. Please check the clinic name and try again.',
  inactive:
    'This clinic is currently inactive. Please contact the clinic for assistance.',
  no_subscription:
    'This clinic does not have an active subscription. Please contact the clinic.',
  subscription_cancelled:
    'This clinic\'s subscription has been cancelled. Please contact the clinic.',
  subscription_expired:
    'This clinic\'s subscription has expired. Please contact the clinic to renew.',
  missing_subdomain:
    'A clinic subdomain is required.',
};

/**
 * GET /api/tenants/validate?subdomain=<subdomain>
 *
 * Validates that a clinic (tenant):
 *   1. Exists in the database (status = "active")
 *   2. Has a subscription record
 *   3. Subscription status is "active"
 *   4. Subscription has not expired (expiresAt > now)
 *
 * Intended for third-party app integration — call this after the user
 * selects a clinic from /api/tenants/directory before proceeding.
 *
 * The endpoint always returns HTTP 200 so the third-party app can
 * inspect `valid` and `reason` without treating 4xx as a hard error.
 * Rate-limited to 20 req/min per IP (public limiter).
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.public);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = request.nextUrl;
  const rawSubdomain = searchParams.get('subdomain')?.toLowerCase().trim() ?? '';

  if (!rawSubdomain) {
    return NextResponse.json(
      buildInvalid('missing_subdomain'),
      { status: 400 }
    );
  }

  try {
    await connectDB();

    // Load tenant + subscription — no staff auth required (public endpoint)
    const tenant = await Tenant.findOne({ subdomain: rawSubdomain })
      .select('name displayName subdomain status settings address subscription')
      .lean() as any;

    // ── 1. Existence check ──────────────────────────────────────────────────
    if (!tenant) {
      return NextResponse.json(buildInvalid('not_found'));
    }

    // ── 2. Active status check ──────────────────────────────────────────────
    if (tenant.status !== 'active') {
      return NextResponse.json(buildInvalid('inactive'));
    }

    // ── 3. Subscription presence check ─────────────────────────────────────
    if (!tenant.subscription) {
      return NextResponse.json(buildInvalid('no_subscription'));
    }

    const sub = tenant.subscription;

    // ── 4. Subscription status check ───────────────────────────────────────
    if (sub.status === 'cancelled') {
      return NextResponse.json(buildInvalid('subscription_cancelled'));
    }

    // ── 5. Expiry check ─────────────────────────────────────────────────────
    const now = new Date();
    const expiresAt: Date | null = sub.expiresAt ? new Date(sub.expiresAt) : null;
    const isExpired = expiresAt !== null && expiresAt < now;

    if (isExpired) {
      return NextResponse.json(buildInvalid('subscription_expired'));
    }

    // ── All checks passed ───────────────────────────────────────────────────
    let daysRemaining: number | null = null;
    if (expiresAt) {
      daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    return NextResponse.json({
      success: true,
      valid: true,
      tenant: {
        id: String(tenant._id),
        name: tenant.name,
        displayName: tenant.displayName || tenant.name,
        subdomain: tenant.subdomain,
        status: tenant.status,
        city: tenant.address?.city ?? null,
        state: tenant.address?.state ?? null,
        country: tenant.address?.country ?? null,
        logo: tenant.settings?.logo ?? null,
      },
      subscription: {
        plan: sub.plan ?? null,
        status: sub.status ?? null,
        billingCycle: sub.billingCycle ?? null,
        isActive: true,
        isTrial: sub.plan === 'trial',
        isExpired: false,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        daysRemaining,
      },
    });
  } catch (error: any) {
    console.error('Error validating tenant:', error);
    return NextResponse.json(
      { success: false, error: 'Validation failed. Please try again.' },
      { status: 500 }
    );
  }
}

function buildInvalid(reason: InvalidReason) {
  return {
    success: true,
    valid: false,
    reason,
    message: REASON_MESSAGES[reason],
  };
}
