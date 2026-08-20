import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { addPointsTransaction, toMembershipDTO, getReferredPatients } from '@/lib/data/membership';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId || null;

    const { id } = await params;
    const body = await request.json();
    const { points, description, type, relatedEntity } = body;

    if (!points || !description) {
      return NextResponse.json(
        { success: false, error: 'Points and description required' },
        { status: 400 }
      );
    }

    // Atomicity: addPointsTransaction() reads the current points balance,
    // computes the new points/totalPointsEarned/totalPointsRedeemed
    // aggregate, and writes those scalars together with a nested
    // `transactions: { create }` in ONE prisma.membership.update() call
    // (lib/data/membership.ts) — the transaction row and the balance
    // update commit atomically.
    const result = await run(tenantId, () =>
      addPointsTransaction(id, {
        points,
        description,
        type,
        relatedEntityType: relatedEntity?.type,
        relatedEntityId: relatedEntity?.id,
      })
    );

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    const referrals = await run(tenantId, () => getReferredPatients(result.membership.patientId));

    return NextResponse.json({ success: true, data: toMembershipDTO(result.membership, referrals) });
  } catch (error: any) {
    console.error('Error updating points:', error);
    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Membership not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update points' },
      { status: 500 }
    );
  }
}
