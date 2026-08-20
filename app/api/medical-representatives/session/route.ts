import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import prisma from '@/lib/prisma';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { cookies } from 'next/headers';

/**
 * GET /api/medical-representatives/session
 * Get current medical representative session data
 */
export async function GET(request: NextRequest) {
  try {
    // Verify session
    const session = await verifySession();

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - No session found' },
        { status: 401 }
      );
    }

    // Check if user is a medical representative
    if (session.role !== 'medical-representative') {
      return NextResponse.json(
        { success: false, error: 'Forbidden - Medical representative access only' },
        { status: 403 }
      );
    }

    // NOTE: there is no lib/data/medical-representative.ts (Phase 4 did not
    // produce one for this batch), so this reads prisma.medicalRepresentative
    // directly rather than reaching for a data-access module that doesn't
    // exist. MedicalRepresentative is a junction-scoped model (see
    // lib/prisma-tenant-extension.ts) so it still needs a tenant context.
    // Explicit tenant branch: a real session.tenantId -> runWithTenant
    // (auto-scoped lookup); no tenantId (legacy no-subdomain mode) ->
    // runAsSystem, since there is no tenant to scope by.
    const tenantId = session.tenantId;
    const lookup = () =>
      prisma.medicalRepresentative.findFirst({
        where: { user: { id: session.userId } },
        omit: {
          paymentStatus: true,
          paymentDate: true,
          paymentAmount: true,
          paymentMethod: true,
          paymentReference: true,
        },
      });

    const medicalRep = tenantId ? await runWithTenant(tenantId, lookup) : await runAsSystem(lookup);

    if (!medicalRep) {
      return NextResponse.json(
        { success: false, error: 'Medical representative not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: medicalRep,
    });
  } catch (error: any) {
    console.error('Get medical representative session error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/medical-representatives/session
 * Logout medical representative (delete session)
 */
export async function DELETE(request: NextRequest) {
  try {
    const cookieStore = await cookies();

    // Delete the session cookie
    cookieStore.delete('session');

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
