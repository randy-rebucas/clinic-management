import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { changeAccountStatus } from '@/lib/account-status';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { USER_STATUSES } from '@/lib/users';

const schema = z.object({
  status: z.enum(USER_STATUSES),
  reason: z.string().trim().max(300).optional(),
});

/**
 * PUT /api/users/:id/status — admin only, same clinic, never your own account.
 * Suspending or closing ends every session at once (sign-in is refused while not active);
 * reopening a closed account counts against the plan's account limit again.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;
  if (!isAdmin(session)) return refuseAccess(session, 'Admin access required');

  try {
    const { id } = await params;
    if (!isValidId(id)) return notFound('User');

    const parsed = await parseBody(request, schema);
    if (isValidationError(parsed)) return parsed;
    const { status, reason } = parsed.data;

    await connectDB();
    const result = await changeAccountStatus({
      tenantId,
      actor: { userId: session.userId, email: session.email, role: session.role },
      userId: id,
      status,
      reason: reason || undefined,
    });
    if (!result.ok) {
      return result.status === 404 ? notFound('User') : NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, data: { status } });
  } catch (error) {
    console.error('Error changing account status:', error);
    return NextResponse.json({ success: false, error: 'Failed to change the account’s access' }, { status: 500 });
  }
}
