import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { verifySession } from '@/app/lib/dal';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

/**
 * PUT /api/medical-representatives/notifications
 * Update notification preferences for medical representative
 *
 * NOTE: the Mongoose MedicalRepresentative schema had no
 * `notificationsEnabled`/`emailNotifications` fields either (not present in
 * models/MedicalRepresentative.ts), so this route's updates were already a
 * silent no-op prior to this migration. Preserved as a no-op here — the
 * lookup/auth/response shape is kept intact in case a future schema change
 * adds these fields.
 */
export async function PUT(request: NextRequest) {
  try {
    // Verify session
    const session = await verifySession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (session.role !== 'medical-representative') {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }
    void body;

    const medicalRep = await run(session.tenantId, async () => {
      const user = await prisma.user.findUnique({ where: { id: session.userId } });
      if (!user) return null;
      return user.medicalRepresentativeProfileId
        ? prisma.medicalRepresentative.findUnique({ where: { id: user.medicalRepresentativeProfileId } })
        : prisma.medicalRepresentative.findFirst({ where: { email: user.email.toLowerCase().trim() } });
    });

    if (!medicalRep) {
      return NextResponse.json(
        { success: false, error: 'Medical representative not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Notification preferences updated',
      data: medicalRep,
    });
  } catch (error: any) {
    console.error('Update notifications error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
