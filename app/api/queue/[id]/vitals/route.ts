import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getQueueEntryRaw, updateQueueEntry } from '@/lib/data/queue';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

// Queue-only vitals (recorded before a Visit exists). Visit.vitals is a
// separate model/route, left on Mongoose per Batch 4's report — not touched
// here.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'queue', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.vitals) {
      return NextResponse.json(
        { success: false, error: 'Vitals data is required' },
        { status: 400 }
      );
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const updatedDoc = await run(tenantId, async () => {
      const current = await getQueueEntryRaw(id);
      if (!current) {
        return null;
      }

      // Merge vitals - preserve existing fields and add/update new ones
      const mergedVitals = {
        bp: current.vitalsBp ?? undefined,
        hr: current.vitalsHr ?? undefined,
        rr: current.vitalsRr ?? undefined,
        tempC: current.vitalsTempC ?? undefined,
        spo2: current.vitalsSpo2 ?? undefined,
        heightCm: current.vitalsHeightCm ?? undefined,
        weightKg: current.vitalsWeightKg ?? undefined,
        bmi: current.vitalsBmi ?? undefined,
        ...body.vitals,
      };

      return updateQueueEntry(id, { vitals: mergedVitals });
    });

    if (!updatedDoc) {
      return NextResponse.json(
        { success: false, error: 'Queue entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedDoc,
      message: 'Vital signs recorded successfully',
    });
  } catch (error: any) {
    console.error('Error updating vitals:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update vital signs' },
      { status: 500 }
    );
  }
}
