import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, forbiddenResponse, isAdmin } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { revokeSeal } from '@/lib/document-seal';

/**
 * Revoke a printed copy (e.g. lost, stolen, or suspected of being used in a
 * false claim). Verification of that serial will then report it as revoked.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serial: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  if (!isAdmin(session)) {
    return forbiddenResponse('Only administrators can revoke document seals');
  }

  try {
    const { serial } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : undefined;
    const tenantContext = await getTenantContext();

    const revoked = await revokeSeal({
      serial,
      tenantId: session.tenantId || tenantContext.tenantId,
      userId: session.userId,
      reason,
    });

    if (!revoked) {
      return NextResponse.json(
        { success: false, error: 'Seal not found or already revoked' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error revoking document seal:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to revoke document seal' },
      { status: 500 }
    );
  }
}
