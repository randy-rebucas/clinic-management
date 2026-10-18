import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { applyDataRetentionPolicy, getDefaultRetentionPolicies } from '@/lib/automations/data-retention';

const policySchema = z.object({
  resource: z.enum(['patients', 'appointments', 'visits', 'invoices', 'lab-results', 'prescriptions', 'documents', 'audit-logs']),
  archiveAfterDays: z.number().int().min(0).max(36500),
  deleteAfterDays: z.number().int().min(0).max(36500),
});

const applySchema = z.object({
  policies: z.array(policySchema).max(20).optional(),
});

/**
 * Apply data retention policy
 * POST /api/data-retention/apply
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  if (!isAdmin(session)) {
    return refuseAccess(session, 'Unauthorized - Admin access required', 'data-retention', 'write');
  }

  try {
    await connectDB();

    // An empty body means "apply the default policies".
    const text = await request.text();
    let raw: unknown = {};
    if (text.trim()) {
      try {
        raw = JSON.parse(text);
      } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
      }
    }
    const parsed = applySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Validation failed' }, { status: 400 });
    }

    const result = await applyDataRetentionPolicy(
      tenantId,
      parsed.data.policies || getDefaultRetentionPolicies()
    );

    return NextResponse.json({
      success: result.success,
      data: result,
    });
  } catch (error: any) {
    console.error('Error applying data retention policy:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to apply retention policy' },
      { status: 500 }
    );
  }
}
